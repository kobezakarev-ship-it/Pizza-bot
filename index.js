const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ChannelType, 
  PermissionsBitField 
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = "YOUR_BOT_TOKEN";
const CATEGORY_ID = "YOUR_CATEGORY_ID";

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {

  // CREATE TICKET BUTTON
  if (interaction.isButton() && interaction.customId === 'create_ticket') {

    const modal = new ModalBuilder()
      .setCustomId('ticket_modal')
      .setTitle('Open a Support Ticket');

    const input = new TextInputBuilder()
      .setCustomId('ticket_reason')
      .setLabel('What do you need help with?')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  // MODAL SUBMIT (CREATE CHANNEL)
  if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {

    const reason = interaction.fields.getTextInputValue('ticket_reason');

    const channel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: CATEGORY_ID,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [PermissionsBitField.Flags.ViewChannel],
        }
      ]
    });

    const embed = new EmbedBuilder()
      .setTitle(`Ticket`)
      .setDescription(`Hello ${interaction.user}, welcome to your support ticket.\n\n**Your request:**\n${reason}`)
      .setColor('Purple');

    const closeBtn = new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(closeBtn);

    await channel.send({
      embeds: [embed],
      components: [row]
    });

    await interaction.reply({
      content: `Your ticket has been created: ${channel}`,
      ephemeral: true
    });
  }

  // CLOSE BUTTON → MODAL
  if (interaction.isButton() && interaction.customId === 'close_ticket') {

    const modal = new ModalBuilder()
      .setCustomId('close_modal')
      .setTitle('Close Ticket');

    const input = new TextInputBuilder()
      .setCustomId('close_reason')
      .setLabel('Why are you closing this ticket?')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  // CLOSE SUBMIT
  if (interaction.isModalSubmit() && interaction.customId === 'close_modal') {

    await interaction.reply({ content: 'Closing ticket...', ephemeral: true });

    setTimeout(() => {
      interaction.channel.delete();
    }, 3000);
  }

});

client.login(TOKEN);
