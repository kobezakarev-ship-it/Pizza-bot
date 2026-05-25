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

  if (s === 'month') {
    return 31 * 24 * 60 * 60 * 1000;
  }

  const match = s.match(/^(\d+)(s|m|h|d)$/);

  if (!match) return null;

  const value = parseInt(match[1]);

  const unitMap = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000
  };

  return value * unitMap[match[2]];
}

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);

  if (sec < 60) return `${sec}s`;

  const min = Math.floor(sec / 60);

  if (min < 60) return `${min}m`;

  const hr = Math.floor(min / 60);

  if (hr < 24) return `${hr}h`;

  const day = Math.floor(hr / 24);

  return `${day}d`;
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

          console.log(`✅ Unbanned ${userId}`);
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

  // ── HELP ─────────────────────────────────────

  if (command === 'help') {

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🤖 Bot Commands')
      .setDescription(
`🛡️ Moderation
\`.ban @user\`
\`.unban id\`
\`.kick @user\`
\`.warn @user\`
\`.timeout @user\`

📨 Utility
\`.ticket\`

📂 Applications
\`.open sa\`
\`.open mta\`
\`.open mma\`
\`.open tha\`

\`.close sa\`
\`.close mta\`
\`.close mma\`
\`.close tha\`
`
      );

    return message.channel.send({ embeds: [embed] });
  }

  // ── WARN ─────────────────────────────────────

  if (command === 'warn') {

    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ No permission.');
    }

    const targetUser = getUserFromMention(message);

    if (!targetUser) {
      return message.reply('❌ Mention a user.');
    }

    const target = await message.guild.members.fetch(targetUser.id).catch(() => null);

    if (!target) {
      return message.reply('❌ User not in server.');
    }

    const reason = args.slice(1).join(' ') || 'No reason';

    try {
      await target.timeout(60 * 60 * 1000, reason);
    } catch {}

    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('⚠️ User Warned')
      .addFields(
        { name: 'User', value: `${target.user.tag}` },
        { name: 'Reason', value: reason }
      );

    return message.channel.send({ embeds: [embed] });
  }

  // ── KICK ─────────────────────────────────────

  if (command === 'kick') {

    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('❌ No permission.');
    }

    const targetUser = getUserFromMention(message);

    if (!targetUser) {
      return message.reply('❌ Mention a user.');
    }

    const target = await message.guild.members.fetch(targetUser.id).catch(() => null);

    if (!target) {
      return message.reply('❌ User not in server.');
    }

    try {
      await target.kick();
    } catch {
      return message.reply('❌ Failed.');
    }

    return message.channel.send(`✅ Kicked ${target.user.tag}`);
  }

  // ── BAN ─────────────────────────────────────

  if (command === 'ban') {

    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ No permission.');
    }

    const targetUser = getUserFromMention(message);

    if (!targetUser) {
      return message.reply('❌ Mention a user.');
    }

    let durationMs = null;

    const possibleDuration = args[1];

    if (possibleDuration) {
      const parsed = parseDuration(possibleDuration);

      if (parsed !== null) {
        durationMs = parsed;
      }
    }

    try {
      await message.guild.members.ban(targetUser.id);
    } catch {
      return message.reply('❌ Failed.');
    }

    if (durationMs) {
      timedBans.set(targetUser.id, {
        guildId: message.guild.id,
        unbanAt: Date.now() + durationMs,
      });
    }

    return message.channel.send(`🔨 Banned ${targetUser.id}`);
  }

  // ── UNBAN ─────────────────────────────────────

  if (command === 'unban') {

    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ No permission.');
    }

    const id = args[0];

    if (!id) {
      return message.reply('❌ Give user ID.');
    }

    try {
      await message.guild.members.unban(id);
    } catch {
      return message.reply('❌ Failed.');
    }

    return message.channel.send(`✅ Unbanned ${id}`);
  }

  // ── TIMEOUT ─────────────────────────────────────

  if (command === 'timeout') {

    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ No permission.');
    }

    const targetUser = getUserFromMention(message);

    if (!targetUser) {
      return message.reply('❌ Mention a user.');
    }

    const target = await message.guild.members.fetch(targetUser.id).catch(() => null);

    if (!target) {
      return message.reply('❌ User not in server.');
    }

    const durationStr = args[1] || '10m';

    const durationMs = parseDuration(durationStr);

    if (!durationMs) {
      return message.reply('❌ Invalid duration.');
    }

    try {
      await target.timeout(durationMs);
    } catch {
      return message.reply('❌ Failed.');
    }

    return message.channel.send(`⏱️ Timed out ${target.user.tag}`);
  }

  // ── APPLICATION SYSTEM ─────────────────────────────────────

  if (command === 'open' || command === 'close') {

    if (message.author.id !== message.guild.ownerId) {
      return message.reply('❌ Only owner.');
    }

    message.delete().catch(() => {});

    const type = args[0];

    const forms = {
      sa: {
        title: 'STAFF APPLICATIONS ARE OPEN!',
        link: 'https://docs.google.com/forms/d/e/1FAIpQLSekfbqmKNW9j633OjbyY0r86JiOkhZvQiomik69QeseCtme6w/viewform?usp=header',
      },

      mta: {
        title: 'MOD TESTER APPLICATIONS ARE OPEN!',
        link: 'https://docs.google.com/forms/d/e/1FAIpQLScMUyx6y3PgulZR2d6hc9EqhWYAoJQtSHCADfj00NtLQd6SvA/viewform?usp=publish-editor',
      },

      mma: {
        title: 'MOD MAKER APPLICATIONS ARE OPEN!',
        link: 'https://docs.google.com/forms/d/e/1FAIpQLSc6Cu0vtcj3CsoreAR8hqY1my4qI0ts7kL261oRIeMm3GyqUg/viewform?usp=publish-editor',
      },

      tha: {
        title: 'TICKET HELPER APPLICATIONS ARE OPEN!',
        link: 'https://docs.google.com/forms/d/e/1FAIpQLSc547PizPSHtfHH6ceYEFQd4DQbK298n84-WMsYi5PFCSD7wA/viewform?usp=publish-editor',
      },
    };

    const data = forms[type];

    if (!data) {
      return message.channel.send('❌ Invalid type.');
    }

    const members = await message.guild.members.fetch();

    if (command === 'open') {

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(data.title)
        .setDescription(`[CLICK HERE TO APPLY](${data.link})`);

      message.channel.send({ embeds: [embed] });

      for (const [, member] of members) {
        if (member.user.bot) continue;

        try {
          await member.send({ embeds: [embed] });
        } catch {}
      }

    } else {

      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('APPLICATIONS CLOSED')
        .setDescription(`${type.toUpperCase()} applications are officially closed.`);

      message.channel.send({ embeds: [embed] });

      for (const [, member] of members) {
        if (member.user.bot) continue;

        try {
          await member.send({ embeds: [embed] });
        } catch {}
      }
    }
  }

  // ── TICKET PANEL ─────────────────────────────────────

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

  if (interaction.isButton() && interaction.customId === 'create_ticket') {

    const guild = interaction.guild;
    const user = interaction.user;

    if (openTickets.has(user.id)) {
      return interaction.reply({
        content: '❌ You already have a ticket.',
        ephemeral: true
      });
    }

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
      ],
    });

    openTickets.set(user.id, channel.id);

    await channel.send(`🎫 Welcome <@${user.id}>`);

    await interaction.reply({
      content: `✅ Ticket created: ${channel}`,
      ephemeral: true
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
