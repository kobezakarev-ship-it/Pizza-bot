const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle, Partials } = require('discord.js');

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

// ── PIZZA IMAGE ───────────────────────────────────────────────────────────────
// Replace this with your actual image URL (e.g. upload to imgur and paste the direct link)
const PIZZA_IMAGE_URL = 'YOUR_PIZZA_IMAGE_URL_HERE';

// ── TICKET COUNTER ────────────────────────────────────────────────────────────
let ticketCounter = 0;
const openTickets = new Map();

// ── GD GAME STATE ─────────────────────────────────────────────────────────────
const gdGames = new Map();

// ── AFK SYSTEM ────────────────────────────────────────────────────────────────
const afkUsers = new Map();
const afkPingCount = new Map();

// ── REACTION ROLES ────────────────────────────────────────────────────────────
const reactionRoleMessages = new Map();

const REACTION_ROLES = {
  '❤️': 'red',
  '💙': 'blue',
  '💛': 'yellow',
  '💜': 'purple',
  '🩷': 'pink',
  '🧡': 'orange',
  '💚': 'green',
};

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

  // ── AFK PING DETECTION ─────────────────────────────────────────────────────
  if (message.mentions.users.size > 0) {
    for (const [userId, afkData] of afkUsers) {
      if (message.mentions.users.has(userId)) {
        const afkMember = message.guild.members.cache.get(userId);
        const pinger = message.member;

        const minutesAgo = Math.floor((Date.now() - afkData.timestamp) / 60000);
        const timeAgo = minutesAgo < 60
          ? `${minutesAgo} minute${minutesAgo !== 1 ? 's' : ''} ago`
          : `${Math.floor(minutesAgo / 60)} hour${Math.floor(minutesAgo / 60) !== 1 ? 's' : ''} ago`;

        await message.reply(`**<@${userId}> is currently having a life...**\nAway since ${timeAgo}`);

        const key = `${message.channel.id}-${message.author.id}-${userId}`;
        const count = (afkPingCount.get(key) || 0) + 1;
        afkPingCount.set(key, count);

        if (count >= 3 && afkMember) {
          const pingerHighest = pinger.roles.highest.position;
          const afkHighest = afkMember.roles.highest.position;

          if (pingerHighest <= afkHighest) {
            try {
              await pinger.timeout(60 * 60 * 1000, `Spamming AFK user ${afkMember.user.username}`);
              afkPingCount.delete(key);
              const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('⏱️ Timed Out for Spamming AFK User')
                .setDescription(`<@${message.author.id}> has been timed out for 1 hour for pinging <@${userId}> 3 times while they are AFK.`)
                .setTimestamp();
              message.channel.send({ embeds: [embed] });
            } catch {}
          } else {
            afkPingCount.delete(key);
            message.reply(`⚠️ Stop pinging <@${userId}>, they are AFK!`);
          }
        }
      }
    }
  }

  // ── Remove AFK when the AFK user speaks ───────────────────────────────────
  if (afkUsers.has(message.author.id) && !message.content.startsWith('.afk')) {
    afkUsers.delete(message.author.id);
    for (const key of afkPingCount.keys()) {
      if (key.endsWith(`-${message.author.id}`)) afkPingCount.delete(key);
    }
    message.reply(`✅ Welcome back <@${message.author.id}>! Your AFK has been removed.`);
  }

  if (!message.content.startsWith('.')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // ── .afk ───────────────────────────────────────────────────────────────────
  if (command === 'afk') {
    const reason = args.join(' ') || 'having a life';
    afkUsers.set(message.author.id, { reason, timestamp: Date.now() });
    message.reply(`✅ You are now AFK: *${reason}*`);
  }

  // ── .warn ──────────────────────────────────────────────────────────────────
  else if (command === 'warn') {
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
      .setThumbnail(PIZZA_IMAGE_URL)
      .setTimestamp();
    message.channel.send({ embeds: [embed] });

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

  // ── .unwarn ────────────────────────────────────────────────────────────────
  else if (command === 'unwarn') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ You do not have permission to unwarn members.');
    }
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Please mention a user to unwarn.');

    try {
      await target.timeout(null);
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
      .setThumbnail(PIZZA_IMAGE_URL)
      .setTimestamp();
    message.channel.send({ embeds: [embed] });

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
      await new Promise(r => setTimeout(r, 300));
    }

    message.channel.send(`✅ DMs sent! **${success}** delivered, **${failed}** failed (users with DMs off).`);
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
      .setThumbnail(PIZZA_IMAGE_URL)
      .setTimestamp();
    message.channel.send({ embeds: [embed] });
  }

  // ── .unkick ────────────────────────────────────────────────────────────────
  else if (command === 'unkick') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('❌ You do not have permission to use this command.');
    }

    let invite;
    try {
      invite = await message.channel.createInvite({ maxAge: 86400, maxUses: 1, unique: true });
    } catch {
      return message.reply('❌ Could not create an invite link. Check my permissions.');
    }

    const embed = new EmbedBuilder()
      .setColor(0x00FF99)
      .setTitle('🔓 Unkick — Invite Link Generated')
      .setDescription(
        `Since Discord doesn't allow bots to force-add kicked users back, here's a **one-time invite link** you can send to them:\n\n**${invite.url}**\n\n*This link expires in 24 hours and can only be used once.*`
      )
      .addFields(
        { name: 'Moderator', value: `@${message.author.username}` },
      )
      .setThumbnail(PIZZA_IMAGE_URL)
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

    // Duration is the second arg, reason is everything after
    const durationStr = args[1] || null;
    const reason = args.slice(2).join(' ') || 'No reason provided';

    const durationMs = durationStr ? parseBanDuration(durationStr) : null;
    if (durationStr && !durationMs) {
      return message.reply(
        '❌ Invalid duration. Examples:\n' +
        '`60s` `60secs` → 60 seconds\n' +
        '`5m` `5mins` → 5 minutes\n' +
        '`1h` `1hour` `60m` → 1 hour\n' +
        '`24h` `1d` `1day` → 1 day\n' +
        '`7d` `7days` `week` `1week` → 7 days\n' +
        '`30d` `30days` `month` `1month` → 30 days\n' +
        '`365d` `365days` `year` `1year` → 1 year\n' +
        'Leave duration out for a permanent ban.'
      );
    }

    try {
      await target.ban({ reason: durationMs ? `Timed ban (${durationStr}): ${reason}` : reason });
      if (durationMs) {
        setTimeout(async () => {
          await message.guild.members.unban(target.id, 'Timed ban expired').catch(() => {});
        }, durationMs);
      }
    } catch {
      return message.reply('❌ Could not ban that user.');
    }

    // Format duration nicely for the embed
    let durationDisplay = 'Permanent';
    if (durationMs) {
      const totalSecs = durationMs / 1000;
      if (totalSecs < 60)          durationDisplay = `${totalSecs} second${totalSecs !== 1 ? 's' : ''}`;
      else if (totalSecs < 3600)   durationDisplay = `${Math.round(totalSecs / 60)} minute${Math.round(totalSecs / 60) !== 1 ? 's' : ''}`;
      else if (totalSecs < 86400)  durationDisplay = `${Math.round(totalSecs / 3600)} hour${Math.round(totalSecs / 3600) !== 1 ? 's' : ''}`;
      else if (totalSecs < 604800) durationDisplay = `${Math.round(totalSecs / 86400)} day${Math.round(totalSecs / 86400) !== 1 ? 's' : ''}`;
      else if (totalSecs < 2592000)  durationDisplay = `${Math.round(totalSecs / 604800)} week${Math.round(totalSecs / 604800) !== 1 ? 's' : ''}`;
      else if (totalSecs < 31536000) durationDisplay = `${Math.round(totalSecs / 2592000)} month${Math.round(totalSecs / 2592000) !== 1 ? 's' : ''}`;
      else durationDisplay = '1 year';
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🍕 User Banned')
      .addFields(
        { name: 'User', value: `${target.user.username} (${target.user.id})` },
        { name: 'Moderator', value: `@${message.author.username}` },
        { name: 'Duration', value: durationDisplay },
        { name: 'Reason', value: reason },
      )
      .setThumbnail(PIZZA_IMAGE_URL)
      .setTimestamp();
    message.channel.send({ embeds: [embed] });
  }

  // ── .unban ─────────────────────────────────────────────────────────────────
  else if (command === 'unban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ You do not have permission to unban members.');
    }

    const userId = args[0];
    if (!userId) return message.reply('❌ Please provide a user ID to unban. Usage: `.unban <userId> [reason]`');
    const reason = args.slice(1).join(' ') || 'No reason provided';

    let unbannedUser;
    try {
      const banEntry = await message.guild.bans.fetch(userId);
      unbannedUser = banEntry.user;
      await message.guild.members.unban(userId, reason);
    } catch {
      return message.reply('❌ Could not unban that user. Make sure the ID is correct and they are actually banned.');
    }

    const embed = new EmbedBuilder()
      .setColor(0x00FF99)
      .setTitle('✅ User Unbanned')
      .addFields(
        { name: 'User', value: `${unbannedUser.username} (${unbannedUser.id})` },
        { name: 'Moderator', value: `@${message.author.username}` },
        { name: 'Reason', value: reason },
      )
      .setThumbnail(PIZZA_IMAGE_URL)
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
      .setThumbnail(PIZZA_IMAGE_URL)
      .setTimestamp();
    message.channel.send({ embeds: [embed] });
  }

  // ── .untimeout ─────────────────────────────────────────────────────────────
  else if (command === 'untimeout') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ You do not have permission to remove timeouts.');
    }
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Please mention a user to remove the timeout from.');

    try {
      await target.timeout(null);
    } catch {
      return message.reply('❌ Could not remove timeout. Check bot role position.');
    }

    const embed = new EmbedBuilder()
      .setColor(0x00FF99)
      .setTitle('✅ Timeout Removed')
      .addFields(
        { name: 'User', value: `${target.user.username} (${target.user.id})` },
        { name: 'Moderator', value: `@${message.author.username}` },
        { name: 'Timeout', value: 'Removed' },
      )
      .setThumbnail(PIZZA_IMAGE_URL)
      .setTimestamp();
    message.channel.send({ embeds: [embed] });

    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0x00FF99)
        .setTitle('✅ Your timeout has been removed')
        .addFields(
          { name: 'Server', value: message.guild.name },
          { name: 'Timeout', value: 'Removed' },
        )
        .setTimestamp();
      await target.send({ embeds: [dmEmbed] });
    } catch {}
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

  // ── .setup (reaction roles) ────────────────────────────────────────────────
  else if (command === 'setup') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply('❌ You do not have permission to set up reaction roles.');
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎨 React to choose your colour!')
      .setDescription(
        '❤️ = red\n' +
        '💙 = blue\n' +
        '💛 = yellow\n' +
        '💜 = purple\n' +
        '🩷 = pink\n' +
        '🧡 = orange\n' +
        '💚 = green'
      );

    const setupMsg = await message.channel.send({ embeds: [embed] });

    for (const emoji of Object.keys(REACTION_ROLES)) {
      await setupMsg.react(emoji);
    }

    reactionRoleMessages.set(setupMsg.id, true);
    message.delete().catch(() => {});
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
    const pingText = staffRole ? `<@${user.id}> ${staffRole}` : `<@${user.id}>`;

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
    if (state && !state.gameOver && !state.jumping) {
      state.jumping = true;
      state.jumpFrames = 0;
    }
  }

  // ── GD Replay button ───────────────────────────────────────────────────────
  else if (interaction.isButton() && interaction.customId.startsWith('gd_replay_')) {
    await interaction.deferUpdate();
    const oldState = gdGames.get(interaction.message.id);
    if (oldState) {
      clearInterval(oldState.interval);
      gdGames.delete(interaction.message.id);
    }
    await startGDGame(interaction.channel, interaction.message);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GEOMETRY DASH MINI-GAME (INFINITE)
// ══════════════════════════════════════════════════════════════════════════════
const TRACK_LENGTH = 12;
const PLAYER_POS = 2;

function buildGDFrame(jumping, spikes, gameOver) {
  const topRow = [];
  const midRow = [];
  const floorRow = [];

  for (let x = 0; x < TRACK_LENGTH; x++) {
    const hasSpike = spikes.some(s => s.x === x);
    const isPlayer = x === PLAYER_POS;

    topRow.push(isPlayer && jumping ? '🟦' : '⬛');

    if (isPlayer && !jumping) {
      midRow.push('🟦');
    } else if (hasSpike) {
      midRow.push('🔺');
    } else {
      midRow.push('⬜');
    }

    floorRow.push('⬛');
  }

  let display = topRow.join('') + '\n' + midRow.join('') + '\n' + floorRow.join('');
  if (gameOver) display += '\n\n💀 **You crashed! Press replay to try again.**';
  return display;
}

async function startGDGame(channel, existingMessage = null) {
  const state = {
    spikes: [
      { x: TRACK_LENGTH + 4, scored: false },
      { x: TRACK_LENGTH + 11, scored: false },
    ],
    jumping: false,
    jumpFrames: 0,
    gameOver: false,
    score: 0,
    interval: null,
  };

  const content = buildGDFrame(false, state.spikes, false);

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
  state.interval = setInterval(() => tickGD(msg, state), 1200);
}

async function tickGD(msg, state) {
  if (state.gameOver) return;

  state.spikes.forEach(s => s.x--);

  state.spikes.forEach(s => {
    if (!s.scored && s.x < PLAYER_POS) {
      s.scored = true;
      state.score++;
    }
  });

  state.spikes = state.spikes.filter(s => s.x >= -1);

  while (state.spikes.length < 2) {
    const maxX = state.spikes.length > 0
      ? Math.max(...state.spikes.map(s => s.x))
      : TRACK_LENGTH;
    state.spikes.push({ x: maxX + 8 + Math.floor(Math.random() * 3), scored: false });
  }

  if (state.jumping) {
    state.jumpFrames++;
    if (state.jumpFrames >= 3) {
      state.jumping = false;
      state.jumpFrames = 0;
    }
  }

  const collision = state.spikes.some(s => s.x === PLAYER_POS && !state.jumping);

  if (collision) {
    state.gameOver = true;
    clearInterval(state.interval);
    const content = buildGDFrame(false, state.spikes, true) + `\n🏆 **Spikes dodged: ${state.score}**`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`gd_replay_${msg.id}`)
        .setLabel('🔄 Replay')
        .setStyle(ButtonStyle.Danger)
    );
    await msg.edit({ content, components: [row] }).catch(() => {});
    return;
  }

  const content = buildGDFrame(state.jumping, state.spikes, false) + `\n🏆 Spikes dodged: ${state.score}`;
  await msg.edit({ content }).catch(() => {});
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

// Used by .ban for timed bans with flexible duration strings
function parseBanDuration(str) {
  const s = str.toLowerCase().trim();

  // Named word shortcuts
  if (['week', '1week'].includes(s))   return 7   * 86400 * 1000;
  if (['month', '1month'].includes(s)) return 30  * 86400 * 1000;
  if (['year', '1year'].includes(s))   return 365 * 86400 * 1000;

  // Normalise written-out suffixes down to single letters
  const normalised = s
    .replace(/seconds?|secs?/, 's')
    .replace(/minutes?|mins?/, 'm')
    .replace(/hours?/,          'h')
    .replace(/days?/,           'd')
    .replace(/weeks?/,          'w')
    .replace(/months?/,         'mo')
    .replace(/years?/,          'y');

  const match = normalised.match(/^(\d+)(s|m|h|d|w|mo|y)$/);
  if (!match) return null;

  const val  = parseInt(match[1]);
  const unit = match[2];
  const map  = {
    s:  1_000,
    m:  60_000,
    h:  3_600_000,
    d:  86_400_000,
    w:  7   * 86_400_000,
    mo: 30  * 86_400_000,
    y:  365 * 86_400_000,
  };
  return val * map[unit];
}

// Used by .timeout for simple durations
function parseDuration(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const val = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return val * map[unit];
}

// ══════════════════════════════════════════════════════════════════════════════
// REACTION ROLES
// ══════════════════════════════════════════════════════════════════════════════
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  const roleName = REACTION_ROLES[reaction.emoji.name];
  if (!roleName) return;

  const guild = reaction.message.guild;
  if (!guild) return;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName);
  if (!role) return;

  await member.roles.add(role).catch(e => console.log('Add role error:', e.message));
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;

  const roleName = REACTION_ROLES[reaction.emoji.name];
  if (!roleName) return;

  const guild = reaction.message.guild;
  if (!guild) return;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName);
  if (!role) return;

  await member.roles.remove(role).catch(e => console.log('Remove role error:', e.message));
});

// ══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════════════════════════
client.login(process.env.DISCORD_TOKEN);
