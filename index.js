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
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

let ticketCounter = 0;
const openTickets = new Map();
const timedBans = new Map();

function parseDuration(str) {
  if (!str) return null;
  const s = str.toLowerCase().trim();
  if (s === 'month') return 31 * 24 * 60 * 60 * 1000;
  const match = s.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unitMap = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * unitMap[match[2]];
}

function getUserFromMention(message) {
  const mention = message.mentions.users.first();
  if (mention) return mention;
  const id = message.content.match(/\d{17,20}/)?.[0];
  if (!id) return null;
  return { id };
}

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  setInterval(async () => {
    const now = Date.now();
    for (const [userId, data] of timedBans) {
      if (now >= data.unbanAt) {
        try {
          const guild = await client.guilds.fetch(data.guildId);
          await guild.members.unban(userId);
        } catch {}
        timedBans.delete(userId);
      }
    }
  }, 10000);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('.')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // HELP
  if (command === 'help') {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🤖 Bot Commands')
      .setDescription(`
🛡️ Moderation
.ban @user
.unban id
.kick @user
.warn @user
.timeout @user

📨 Utility
.ticket

📂 Applications
.open sa | mta | mma | tha
.close sa | mta | mma | tha
`);
    return message.channel.send({ embeds: [embed] });
  }

  // MODERATION (same as yours, unchanged)
  if (command === 'kick') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return;
    const user = getUserFromMention(message);
    if (!user) return;
    const target = await message.guild.members.fetch(user.id).catch(() => null);
    if (!target) return;
    await target.kick().catch(() => {});
    message.channel.send(`✅ Kicked ${target.user.tag}`);
  }

  if (command === 'ban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return;
    const user = getUserFromMention(message);
    if (!user) return;

    let durationMs = parseDuration(args[1]);

    await message.guild.members.ban(user.id).catch(() => {});
    if (durationMs) {
      timedBans.set(user.id, {
        guildId: message.guild.id,
        unbanAt: Date.now() + durationMs
      });
    }

    message.channel.send(`🔨 Banned ${user.id}`);
  }

  if (command === 'timeout') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return;
    const user = getUserFromMention(message);
    if (!user) return;
    const target = await message.guild.members.fetch(user.id).catch(() => null);
    if (!target) return;

    const duration = parseDuration(args[1] || '10m');
    if (!duration) return;

    await target.timeout(duration).catch(() => {});
    message.channel.send(`⏱️ Timed out ${target.user.tag}`);
  }

  // TICKET PANEL
  if (command === 'ticket') {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎫 Support Center')
      .setDescription('Click below to contact support.');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('Open Ticket')
        .setStyle(ButtonStyle.Primary)
    );

    message.channel.send({ embeds: [embed], components: [row] });
  }
});

client.on('interactionCreate', async (interaction) => {

  // OPEN MODAL
  if (interaction.isButton() && interaction.customId === 'create_ticket') {

    if (openTickets.has(interaction.user.id)) {
      return interaction.reply({ content: '❌ You already have a ticket.', ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId('ticket_modal')
      .setTitle('Create Ticket');

    const input = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('What do you need help with today?')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    return interaction.showModal(modal);
  }

  // CREATE TICKET
  if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {

    const reason = interaction.fields.getTextInputValue('reason');
    const user = interaction.user;
    const guild = interaction.guild;

    ticketCounter++;

    const channel = await guild.channels.create({
      name: `ticket-${ticketCounter}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ],
    });

    openTickets.set(user.id, channel.id);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🎫 Ticket opened by ${user.tag}`)
      .setDescription(`**Request**\n${reason}\n\nPlease be patient for staff.\nDo not ping repeatedly.`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({ content: `<@${user.id}>`, embeds: [embed], components: [row] });

    interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
  }

  // CLOSE BUTTON
  if (interaction.isButton() && interaction.customId === 'close_ticket') {

    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId('close_modal')
      .setTitle('Close Ticket');

    const input = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Why are you closing this ticket?')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    return interaction.showModal(modal);
  }

  // CLOSE MODAL
  if (interaction.isModalSubmit() && interaction.customId === 'close_modal') {

    const reason = interaction.fields.getTextInputValue('reason');

    await interaction.reply({
      content: `🔒 Closing ticket...\nReason: ${reason}`
    });

    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 3000);
  }
});

client.login(process.env.DISCORD_TOKEN);
