const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let ticketCount = 0;

// READY
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// COMMAND TO SEND PANEL
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content === '.ticket') {

    const embed = new EmbedBuilder()
      .setTitle('🎫 Support Tickets')
      .setDescription(
`Need assistance? Open a ticket and our team will help you as soon as possible.

**How to open a ticket:**
Click the button below and fill out the form.

**Rules:**
Do not ping staff repeatedly. Stay patient and we will be with you when we can.`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_ticket')
        .setLabel('Create Ticket')
        .setStyle(ButtonStyle.Primary)
    );

    message.channel.send({ embeds: [embed], components: [row] });
  }
});

// INTERACTIONS
client.on('interactionCreate', async (interaction) => {
  try {

    // BUTTON CLICK
    if (interaction.isButton() && interaction.customId === 'open_ticket') {

      const modal = new ModalBuilder()
        .setCustomId('ticket_modal')
        .setTitle('Create Ticket');

      const input = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('What do you need help with?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(input)
      );

      return interaction.showModal(modal);
    }

    // MODAL SUBMIT
    if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {

      await interaction.deferReply({ ephemeral: true });

      const reason = interaction.fields.getTextInputValue('reason');
      const guild = interaction.guild;
      const user = interaction.user;

      ticketCount++;
      const ticketNumber = ticketCount.toString().padStart(2, '0');

      // CREATE CHANNEL
      const channel = await guild.channels.create({
        name: `ticket-${ticketNumber}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages
            ]
          }
        ]
      });

      // TICKET MESSAGE
      const embed = new EmbedBuilder()
        .setTitle(`🎫 Ticket ${ticketNumber}`)
        .setDescription(
`**Issue:**
${reason}

Our support team will be with you as fast as we can.

**Rules:**
Do not ping staff repeatedly. Stay patient and we will be with you when we can.`
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger)
      );

      await channel.send({
        content: `<@${user.id}>`,
        embeds: [embed],
        components: [row]
      });

      await interaction.editReply({
        content: `✅ Ticket created: ${channel}`
      });
    }

    // CLOSE BUTTON
    if (interaction.isButton() && interaction.customId === 'close_ticket') {

      await interaction.reply({ content: '🔒 Closing ticket in 3 seconds...' });

      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 3000);
    }

  } catch (err) {
    console.error("ERROR:", err);

    if (interaction.replied || interaction.deferred) {
      interaction.followUp({ content: '❌ Error occurred', ephemeral: true });
    } else {
      interaction.reply({ content: '❌ Error occurred', ephemeral: true });
    }
  }
});

// LOGIN
client.login(process.env.DISCORD_TOKEN);
