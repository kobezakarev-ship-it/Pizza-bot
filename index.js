const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

// ── TICKET COUNTER (in-memory; use a DB for persistence) ──────────────────────
let ticketCounter = 0;
const openTickets = new Map(); // userId → channelId

// ── GD GAME STATE ─────────────────────────────────────────────────────────────
const gdGames = new Map(); // messageId → gameState

// ══════════════════════════════════════════════════════════════════════════════
// READY
// ══════════════════════════════════════════════════════════════════════════════
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGE CREATE
// ══════════════════════════════════════════════════════════════════════════════
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('.')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // ── .warn ──────────────────────────────────────────────────────────────────
  if (command === 'warn') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ You do not have permission to warn members.');
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Please mention a user to warn.');

    const reason = args.slice(1).join(' ') || 'No reason provided';
    const duration = 60 * 60 * 1000; // 1 hour

    try {
      await target.timeout(duration, `Warned: ${reason}`);
    } catch {
      // timeout might fail if target has higher perms
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('⚠️ User Warned')
      .addFields(
        { name: 'User', value: target.user.username, inline: false },
        { name: 'Moderator', value: `@${message.author.username}`, inline: false },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Timeout', value: '1 hour', inline: false },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  // ── .kick ──────────────────────────────────────────────────────────────────
  else if (command === 'kick') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('❌ You do not have permission to kick members.');
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Please mention a user to kick.');

    const reason = args.slice(1).join(' ') || 'No reason provided';

    try {
      await target.kick(reason);
    } catch {
      return message.reply('❌ Could not kick that user.');
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF6600)
      .setTitle('🍕 User Kicked')
      .addFields(
        { name: 'User', value: target.user.username, inline: false },
        { name: 'Moderator', value: `@${message.author.username}`, inline: false },
        { name: 'Reason', value: reason, inline: false },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  // ── .ban ───────────────────────────────────────────────────────────────────
  else if (command === 'ban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ You do not have permission to ban members.');
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Please mention a user to ban.');

    const reason = args.slice(1).join(' ') || 'No reason provided';

    try {
      await target.ban({ reason });
    } catch {
      return message.reply('❌ Could not ban that user.');
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🍕 User Banned')
      .addFields(
        { name: 'User', value: target.user.username, inline: false },
        { name: 'Moderator', value: `@${message.author.username}`, inline: false },
        { name: 'Reason', value: reason, inline: false },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  // ── .timeout ───────────────────────────────────────────────────────────────
  else if (command === 'timeout') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ You do not have permission to timeout members.');
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Please mention a user to timeout.');

    // Usage: .timeout @user 10m reason
    const durationStr = args[1] || '10m';
    const reason = args.slice(2).join(' ') || 'No reason provided';

    const durationMs = parseDuration(durationStr);
    if (!durationMs) return message.reply('❌ Invalid duration. Use e.g. `10m`, `1h`, `2d`.');

    try {
      await target.timeout(durationMs, reason);
    } catch {
      return message.reply('❌ Could not timeout that user.');
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFFF00)
      .setTitle('⏱️ User Timed Out')
      .addFields(
        { name: 'User', value: target.user.username, inline: false },
        { name: 'Moderator', value: `@${message.author.username}`, inline: false },
        { name: 'Duration', value: durationStr, inline: false },
        { name: 'Reason', value: reason, inline: false },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  // ── .ticket ─────────────────────────────────────────────────────────────────
  else if (command === 'ticket') {
    // Only server owners can deploy the ticket panel
    if (message.author.id !== message.guild.ownerId) {
      return message.reply('❌ Only the server owner can deploy the ticket panel.');
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎫 Support Tickets')
      .setDescription(
        'Need assistance? Open a ticket and our team will help you as soon as possible.\n\n' +
        '**How to open a ticket:**\n' +
        'Click the **Create** button below. A form will appear where you can describe your issue or request. After submitting, a private channel will be created just for you.\n\n' +
        '**How to behave in a ticket:**\n' +
        'Be respectful and patient with our staff. Provide all relevant information upfront. Do not ping staff members repeatedly. Stay on topic. Misuse of the ticket system may result in a ban from creating future tickets.\n\n' +
        '*made by erito*'
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('Create Ticket')
        .setStyle(ButtonStyle.Primary)
    );

    message.channel.send({ embeds: [embed], components: [row] });
  }

  // ── .gd ────────────────────────────────────────────────────────────────────
  else if (command === 'gd') {
    await startGDGame(message.channel);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// INTERACTION CREATE (buttons / modals)
// ══════════════════════════════════════════════════════════════════════════════
client.on('interactionCreate', async (interaction) => {

  // ── Create Ticket button ───────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'create_ticket') {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

    const modal = new ModalBuilder()
      .setCustomId('ticket_modal')
      .setTitle('Open a Support Ticket');

    const input = new TextInputBuilder()
      .setCustomId('ticket_reason')
      .setLabel('What do you need help with?')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Describe your issue or request in detail...')
      .setMaxLength(1000)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  // ── Ticket modal submit ────────────────────────────────────────────────────
  else if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
    await interaction.deferReply({ ephemeral: true });

    const reason = interaction.fields.getTextInputValue('ticket_reason');
    const guild = interaction.guild;
    const user = interaction.user;

    // Check if user already has an open ticket
    if (openTickets.has(user.id)) {
      const existing = guild.channels.cache.get(openTickets.get(user.id));
      if (existing) {
        return interaction.editReply(`❌ You already have an open ticket: ${existing}`);
      }
    }

    ticketCounter++;
    const ticketNum = String(ticketCounter).padStart(4, '0');
    const channelName = `ticket-${ticketNum}`;

    // Find or create a "Tickets" category
    let category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'tickets'
    );

    const permissionOverwrites = [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
    ];

    // Give access to admins/mods
    guild.roles.cache.forEach(role => {
      if (role.permissions.has(PermissionFlagsBits.ManageChannels)) {
        permissionOverwrites.push({
          id: role.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
        });
      }
    });

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category?.id,
      permissionOverwrites,
      topic: `Ticket #${ticketNum} | ${user.username} | ${user.id}`,
    });

    openTickets.set(user.id, channel.id);

    // Welcome embed inside the ticket
    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`Ticket #${ticketNum}`)
      .setDescription(
        `Hello <@${user.id}>, welcome to your support ticket.\n\n` +
        `**Your request:**\n${reason}\n\n` +
        'Our team will be with you shortly. Please provide as much detail as possible.\n\n' +
        '**Rules while in this ticket:**\nBe respectful and patient. Do not ping staff repeatedly. Stay on topic.\nProvide all relevant information upfront to speed up the process.'
      )
      .setThumbnail(user.displayAvatarURL())
      .setFooter({ text: `Ticket ID: ${ticketNum} | Opened by ${user.username} | Today at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` });

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`close_ticket_${user.id}`)
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
    );

    // Ping staff role if it exists
    const staffRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('staff') || r.name.toLowerCase().includes('mod'));
    const pingText = staffRole ? `<@${user.id}> ${staffRole} @unknown-role` : `<@${user.id}>`;

    await channel.send({ content: pingText, embeds: [welcomeEmbed], components: [closeRow] });

    await interaction.editReply(`✅ Your ticket has been created: ${channel}`);
  }

  // ── Close Ticket button ────────────────────────────────────────────────────
  else if (interaction.isButton() && interaction.customId.startsWith('close_ticket_')) {
    const userId = interaction.customId.replace('close_ticket_', '');
    openTickets.delete(userId);

    await interaction.reply({ content: '🔒 Ticket will be closed in 5 seconds...', ephemeral: false });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }

  // ── GD Jump button ─────────────────────────────────────────────────────────
  else if (interaction.isButton() && interaction.customId.startsWith('gd_jump_')) {
    const msgId = interaction.customId.replace('gd_jump_', '');
    await interaction.deferUpdate();
    handleGDJump(msgId, interaction);
  }

  // ── GD Replay button ───────────────────────────────────────────────────────
  else if (interaction.isButton() && interaction.customId.startsWith('gd_replay_')) {
    await interaction.deferUpdate();
    startGDGame(interaction.channel, interaction.message);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GEOMETRY DASH MINI-GAME
// ══════════════════════════════════════════════════════════════════════════════

const TRACK_LENGTH = 12;
const SPIKE_POSITIONS = [6, 9]; // positions (0-indexed) where spikes appear
const PLAYER_POS = 1; // player is always rendered at column 1

function buildGDFrame(playerY, spikes, gameOver, won) {
  // playerY: 0 = ground, 1 = jumping
  // spikes: array of {x} positions
  const top = [];
  const bot = [];

  for (let x = 0; x < TRACK_LENGTH; x++) {
    const hasSpike = spikes.some(s => s.x === x);
    const hasPlayer = x === PLAYER_POS;

    if (hasPlayer) {
      top.push(playerY === 1 ? '🟦' : '⬛');
      bot.push(playerY === 0 ? '🟦' : '⬛');
    } else if (hasSpike) {
      top.push('⬛');
      bot.push('🔺');
    } else {
      top.push('⬛');
      bot.push('⬜');
    }
  }

  let display = top.join('') + '\n' + bot.join('');

  if (gameOver) display += '\n\n💀 **You crashed!**';
  else if (won) display += '\n\n🎉 **You won! GG!**';
  else display += '\n\n⬜ = ground   🔺 = spike   🟦 = you';

  return display;
}

async function startGDGame(channel, existingMessage = null) {
  const state = {
    spikes: SPIKE_POSITIONS.map(x => ({ x })),
    playerY: 0,
    frame: 0,
    gameOver: false,
    won: false,
    jumping: false,
    jumpFrames: 0,
    interval: null,
  };

  // shift spikes to start off-screen
  state.spikes = [
    { x: TRACK_LENGTH + 2 },
    { x: TRACK_LENGTH + 7 },
  ];

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('gd_jump_PLACEHOLDER')
      .setLabel('⬆️ Jump')
      .setStyle(ButtonStyle.Primary)
  );

  const content = buildGDFrame(state.playerY, state.spikes, false, false);

  let msg;
  if (existingMessage) {
    // update existing (replay)
    row.components[0].setCustomId(`gd_jump_${existingMessage.id}`);
    await existingMessage.edit({ content, components: [row] });
    msg = existingMessage;
  } else {
    msg = await channel.send({ content, components: [row] });
    row.components[0].setCustomId(`gd_jump_${msg.id}`);
    await msg.edit({ content, components: [row] });
  }

  gdGames.set(msg.id, state);

  // Game tick every 800ms
  state.interval = setInterval(() => tickGD(msg, state), 800);
}

async function tickGD(msg, state) {
  if (state.gameOver || state.won) return;

  state.frame++;

  // Move spikes left
  state.spikes.forEach(s => s.x--);

  // Remove off-screen spikes and add new ones
  state.spikes = state.spikes.filter(s => s.x >= 0);
  if (state.spikes.length < 2) {
    const lastX = Math.max(...state.spikes.map(s => s.x), TRACK_LENGTH);
    state.spikes.push({ x: lastX + 5 + Math.floor(Math.random() * 4) });
  }

  // Handle jump arc (up 1 frame, down next)
  if (state.jumping) {
    state.jumpFrames++;
    if (state.jumpFrames === 1) state.playerY = 1;
    else if (state.jumpFrames >= 2) {
      state.playerY = 0;
      state.jumping = false;
      state.jumpFrames = 0;
    }
  }

  // Collision: spike at PLAYER_POS and player on ground
  const collision = state.spikes.some(s => s.x === PLAYER_POS && state.playerY === 0);

  if (collision) {
    state.gameOver = true;
    clearInterval(state.interval);

    const content = buildGDFrame(state.playerY, state.spikes, true, false);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`gd_replay_${msg.id}`)
        .setLabel('🔄 Replay')
        .setStyle(ButtonStyle.Danger)
    );
    await msg.edit({ content, components: [row] }).catch(() => {});
    return;
  }

  // Win after 30 frames
  if (state.frame >= 30) {
    state.won = true;
    clearInterval(state.interval);
    const content = buildGDFrame(state.playerY, [], false, true);
    await msg.edit({ content, components: [] }).catch(() => {});
    return;
  }

  const content = buildGDFrame(state.playerY, state.spikes, false, false);
  await msg.edit({ content }).catch(() => {});
}

function handleGDJump(msgId, interaction) {
  const state = gdGames.get(msgId);
  if (!state || state.gameOver || state.won) return;
  if (!state.jumping && state.playerY === 0) {
    state.jumping = true;
    state.jumpFrames = 0;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function parseDuration(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const val = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return val * map[unit];
}

// ══════════════════════════════════════════════════════════════════════════════
// LOGIN — replace with your token
// ══════════════════════════════════════════════════════════════════════════════
client.login(process.env.DISCORD_TOKEN);
