const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Partials
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

let ticketCounter = 0;
const openTickets = new Map();

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {

  if (message.author.bot) return;
  if (!message.content.startsWith('.')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // TICKET PANEL
  if (command === 'ticket') {

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎫 Support Tickets')
      .setDescription('Click below to create a support ticket.');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('Create Ticket')
        .setStyle(ButtonStyle.Primary)
    );

    return message.channel.send({
      embeds: [embed],
      components: [row]
    });
  }
});

client.on('interactionCreate', async (interaction) => {

  // CREATE TICKET BUTTON → MODAL
  if (interaction.isButton() && interaction.customId === 'create_ticket') {

    if (openTickets.has(interaction.user.id)) {
      return interaction.reply({
        content: '❌ You already have a ticket.',
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('ticket_modal')
      .setTitle('Support Ticket');

    const input = new TextInputBuilder()
      .setCustomId('ticket_reason')
      .setLabel('What do you need help with today?')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    return interaction.showModal(modal);
  }

  // HANDLE CREATE MODAL
  if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {

    const reason = interaction.fields.getTextInputValue('ticket_reason');
    const guild = interaction.guild;
    const user = interaction.user;

    ticketCounter++;

    const channel = await guild.channels.create({
      name: `ticket-${ticketCounter}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
          ],
        },
        {
          id: guild.roles.everyone,
          allow: [],
        },
      ],
    });

    openTickets.set(user.id, channel.id);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🎫 Ticket opened by ${user.tag}`)
      .setDescription(
`**Request**
${reason}

Please be patient for staff to reply.
Do not ping staff repeatedly.`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      content: `<@${user.id}>`,
      embeds: [embed],
      components: [row]
    });

    await interaction.reply({
      content: `✅ Ticket created: ${channel}`,
      ephemeral: true
    });
  }

  // CLOSE BUTTON → MODAL
  if (interaction.isButton() && interaction.customId === 'close_ticket') {

    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({
        content: '❌ You need timeout permissions to close tickets.',
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('close_modal')
      .setTitle('Close Ticket');

    const input = new TextInputBuilder()
      .setCustomId('close_reason')
      .setLabel('Why do you want to close this ticket?')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    return interaction.showModal(modal);
  }

  // HANDLE CLOSE MODAL
  if (interaction.isModalSubmit() && interaction.customId === 'close_modal') {

    const reason = interaction.fields.getTextInputValue('close_reason');

    await interaction.reply({
      content: `🔒 Ticket closing...\nReason: ${reason}`
    });

    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 3000);
  }
});

client.login(process.env.DISCORD_TOKEN);
