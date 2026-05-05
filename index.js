const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

// ── TICKET COUNTER ────────────────────────────────────────────────────────────
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

    let timedOut = false;
    try {
      await target.timeout(60 * 60 * 1000, `Warned: ${reason}`);
      timedOut = true;
    } catch (e) {
      console.log('Timeout failed:', e.message);
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('⚠️ User Warned')
      .addFields(
        { name: 'User', value: `${target.user.username} (${target.user.id})` },
        { name: 'Moderator', value: `@${message.author.username}` },
        { name: 'Reason', value: reason },
        { name: 'Timeout Applied', value: timedOut ? '✅ 1 hour timeout' : '❌ Could not apply timeout (check bot role position)' },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();
    message.channel.send({ embeds: [embed] });

    // Also DM the warned user
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('⚠️ You have been warned')
        .addFields(
          { name: 'Server', value: message.guild.name },
          { name: 'Reason', value: reason },
          { name: 'Timeout', value: '1 hour' },
        )
        .setTimestamp();
      await target.send({ embeds: [dmEmbed] });
    } catch {}
  }

  // ── .dmall ─────────────────────────────────────────────────────────────────
  else if (command === 'dmall') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ You do not have permission to use this command.');
    }

    const dmMessage = args.join(' ') || null;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📢 Message from ${message.guild.name}`)
      .setDescription(dmMessage || 'You have received a message from the server staff.')
      .setFooter({ text: `Sent by ${message.author.username}` })
      .setTimestamp();

    await message.reply('⏳ Sending DMs to all members...');

    // Fetch all members including offline
    const members = await message.guild.members.fetch();
    let success = 0;
    let failed = 0;

    for (const [, member] of members) {
      if (member.user.bot) continue;
      try {
        await member.send({ embeds: [embed] });
        success++;
      } catch {
        failed++;
      }
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 300));
    }

    message.channel.send(`✅ DMs sent! **${success}** delivered, **${failed}** failed (users with DMs off).`);
  }

  // ── .unwarn ────────────────────────────────────────────────────────────────
  else if (command === 'unwarn') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ You do not have permission to unwarn members.');
    }
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Please mention a user to unwarn.');

    try {
      await target.timeout(null); // removes timeout
    } catch (e) {
      return message.reply('❌ Could not remove timeout. Check bot role position.');
    }

    const embed = new EmbedBuilder()
      .setColor(0x00FF99)
      .setTitle('✅ User Unwarned')
      .addFields(
        { name: 'User', value: `${target.user.username} (${target.user.id})` },
        { name: 'Moderator', value: `@${message.author.username}` },
        { name: 'Timeout', value: 'Removed' },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();
    message.channel.send({ embeds: [embed] });

    // DM the user
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0x00FF99)
        .setTitle('✅ Your warning has been removed')
        .addFields(
          { name: 'Server', value: message.guild.name },
          { name: 'Timeout', value: 'Removed' },
        )
        .setTimestamp();
      await target.send({ embeds: [dmEmbed] });
    } catch {}
  }

  // ── .kick ──────────────────────────────────────────────────────────────────
  else if (command === 'kick') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('❌ You do not have permission to kick members.');
    }
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Please mention a user to kick.');
    const reason = args.slice(1).join(' ') || 'No reason provided';
    try { await target.kick(reason); } catch { return message.reply('❌ Could not kick that user.'); }

    const embed = new EmbedBuilder()
      .setColor(0xFF6600)
      .setTitle('🍕 User Kicked')
      .addFields(
        { name: 'User', value: target.user.username },
        { name: 'Moderator', value: `@${message.author.username}` },
        { name: 'Reason', value: reason },
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
    try { await target.ban({ reason }); } catch { return message.reply('❌ Could not ban that user.'); }

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🍕 User Banned')
      .addFields(
        { name: 'User', value: target.user.username },
        { name: 'Moderator', value: `@${message.author.username}` },
        { name: 'Reason', value: reason },
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
    const durationStr = args[1] || '10m';
    const reason = args.slice(2).join(' ') || 'No reason provided';
    const durationMs = parseDuration(durationStr);
    if (!durationMs) return message.reply('❌ Invalid duration. Use e.g. `10m`, `1h`, `2d`.');
    try { await target.timeout(durationMs, reason); } catch { return message.reply('❌ Could not timeout that user.'); }

    const embed = new EmbedBuilder()
      .setColor(0xFFFF00)
      .setTitle('⏱️ User Timed Out')
      .addFields(
        { name: 'User', value: target.user.username },
        { name: 'Moderator', value: `@${message.author.username}` },
        { name: 'Duration', value: durationStr },
        { name: 'Reason', value: reason },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();
    message.channel.send({ embeds: [embed] });
  }

  // ── .ticket ────────────────────────────────────────────────────────────────
  else if (command === 'ticket') {
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
        '*made by Purpleskeleton__*'
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
// INTERACTION CREATE
// ══════════════════════════════════════════════════════════════════════════════
client.on('interactionCreate', async (interaction) => {

  // ── Create Ticket button ───────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'create_ticket') {
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

    if (openTickets.has(user.id)) {
      const existing = guild.channels.cache.get(openTickets.get(user.id));
      if (existing) return interaction.editReply(`❌ You already have an open ticket: ${existing}`);
    }

    ticketCounter++;
    const ticketNum = String(ticketCounter).padStart(4, '0');

    const permissionOverwrites = [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
    ];

    guild.roles.cache.forEach(role => {
      if (role.permissions.has(PermissionFlagsBits.ManageChannels)) {
        permissionOverwrites.push({
          id: role.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
        });
      }
    });

    const category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'tickets'
    );

    const channel = await guild.channels.create({
      name: `ticket-${ticketNum}`,
      type: ChannelType.GuildText,
      parent: category?.id,
      permissionOverwrites,
      topic: `Ticket #${ticketNum} | ${user.username} | ${user.id}`,
    });

    openTickets.set(user.id, channel.id);

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

    const staffRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('staff') || r.name.toLowerCase().includes('mod'));
    const pingText = staffRole ? `<@${user.id}> ${staffRole} @unknown-role` : `<@${user.id}>`;

    await channel.send({ content: pingText, embeds: [welcomeEmbed], components: [closeRow] });
    await interaction.editReply(`✅ Your ticket has been created: ${channel}`);
  }

  // ── Close Ticket button ────────────────────────────────────────────────────
  else if (interaction.isButton() && interaction.customId.startsWith('close_ticket_')) {
    const userId = interaction.customId.replace('close_ticket_', '');
    openTickets.delete(userId);
    await interaction.reply({ content: '🔒 Ticket will be closed in 5 seconds...' });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }

  // ── GD Jump button ─────────────────────────────────────────────────────────
  else if (interaction.isButton() && interaction.customId.startsWith('gd_jump_')) {
    const msgId = interaction.customId.replace('gd_jump_', '');
    await interaction.deferUpdate();
    const state = gdGames.get(msgId);
    if (state && !state.gameOver && !state.won && state.playerY === 0 && !state.jumping) {
      state.jumping = true;
      state.jumpFrames = 0;
    }
  }

  // ── GD Replay button ───────────────────────────────────────────────────────
  else if (interaction.isButton() && interaction.customId.startsWith('gd_replay_')) {
    await interaction.deferUpdate();
    // Clear old game
    const oldState = gdGames.get(interaction.message.id);
    if (oldState) {
      clearInterval(oldState.interval);
      gdGames.delete(interaction.message.id);
    }
    await startGDGame(interaction.channel, interaction.message);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GEOMETRY DASH MINI-GAME (FIXED)
// ══════════════════════════════════════════════════════════════════════════════

const TRACK_LENGTH = 14;
const PLAYER_POS = 1;

function buildGDFrame(playerY, spikes, gameOver, won) {
  const top = [];
  const bot = [];

  for (let x = 0; x < TRACK_LENGTH; x++) {
    const hasSpike = spikes.some(s => Math.round(s.x) === x);
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
  if (gameOver) display += '\n\n💀 **You crashed! Press replay to try again.**';
  else if (won) display += '\n\n🎉 **You won! GG!**';
  else display += '\n\n⬜ = ground  🔺 = spike  🟦 = you';

  return display;
}

async function startGDGame(channel, existingMessage = null) {
  const state = {
    // Spikes start far off screen to the right, well spaced apart
    spikes: [
      { x: TRACK_LENGTH + 4 },
      { x: TRACK_LENGTH + 12 },
    ],
    playerY: 0,
    frame: 0,
    gameOver: false,
    won: false,
    jumping: false,
    jumpFrames: 0,
    interval: null,
  };

  const content = buildGDFrame(state.playerY, state.spikes, false, false);

  let msg;
  if (existingMessage) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`gd_jump_${existingMessage.id}`)
        .setLabel('⬆️ Jump')
        .setStyle(ButtonStyle.Primary)
    );
    await existingMessage.edit({ content, components: [row] });
    msg = existingMessage;
  } else {
    // Send placeholder first to get message ID
    msg = await channel.send({ content });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`gd_jump_${msg.id}`)
        .setLabel('⬆️ Jump')
        .setStyle(ButtonStyle.Primary)
    );
    await msg.edit({ content, components: [row] });
  }

  gdGames.set(msg.id, state);

  // Tick every 900ms — slightly slower so second spike is easier to react to
  state.interval = setInterval(() => tickGD(msg, state), 900);
}

async function tickGD(msg, state) {
  if (state.gameOver || state.won) return;

  state.frame++;

  // Move spikes left by 1 each tick
  state.spikes.forEach(s => s.x -= 1);

  // Remove spikes that have gone off-screen to the left
  state.spikes = state.spikes.filter(s => s.x >= -1);

  // Add new spike when needed — always spaced at least 8 tiles apart
  if (state.spikes.length < 2) {
    const maxX = state.spikes.length > 0 ? Math.max(...state.spikes.map(s => s.x)) : PLAYER_POS;
    const newX = maxX + 8 + Math.floor(Math.random() * 3); // 8-10 gap
    state.spikes.push({ x: newX });
  }

  // Jump arc: up for 2 frames, down for 1
  if (state.jumping) {
    state.jumpFrames++;
    if (state.jumpFrames <= 2) {
      state.playerY = 1; // in the air
    } else {
      state.playerY = 0; // land
      state.jumping = false;
      state.jumpFrames = 0;
    }
  }

  // Collision check — only when player is on the ground
  const collision = state.spikes.some(s => Math.round(s.x) === PLAYER_POS && state.playerY === 0);

  if (collision) {
    state.gameOver = true;
    clearInterval(state.interval);
    const content = buildGDFrame(0, state.spikes, true, false);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`gd_replay_${msg.id}`)
        .setLabel('🔄 Replay')
        .setStyle(ButtonStyle.Danger)
    );
    await msg.edit({ content, components: [row] }).catch(() => {});
    return;
  }

  // Win after 35 frames
  if (state.frame >= 35) {
    state.won = true;
    clearInterval(state.interval);
    const content = buildGDFrame(state.playerY, [], false, true);
    await msg.edit({ content, components: [] }).catch(() => {});
    return;
  }

  const content = buildGDFrame(state.playerY, state.spikes, false, false);
  await msg.edit({ content }).catch(() => {});
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
// LOGIN
// ══════════════════════════════════════════════════════════════════════════════
client.login(process.env.DISCORD_TOKEN);
