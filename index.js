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

// ── TICKET COUNTER ────────────────────────────────────────────────────────────
let ticketCounter = 0;
const openTickets = new Map();

// ── GD GAME STATE ─────────────────────────────────────────────────────────────
const gdGames = new Map();

// ── AFK SYSTEM ────────────────────────────────────────────────────────────────
const afkUsers = new Map();
const afkPingCount = new Map();

// ── TIMED BANS ────────────────────────────────────────────────────────────────
const timedBans = new Map();

// ── REACTION ROLES ────────────────────────────────────────────────────────────
const reactionRoleMessages = new Map();

// ── AI CHAT CHANNELS ──────────────────────────────────────────────────────────
// userId → channelId so each user can only have one AI chat open at a time
const aiChatChannels = new Map();
// channelId → conversation history array for Claude API
const aiConversations = new Map();

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

  setInterval(async () => {
    const now = Date.now();
    for (const [userId, data] of timedBans) {
      if (now >= data.unbanAt) {
        try {
          const guild = await client.guilds.fetch(data.guildId);
          await guild.members.unban(userId, 'Timed ban expired');
          console.log(`✅ Unbanned ${userId} from ${guild.name} (timed ban expired)`);
        } catch (e) {
          console.log(`Could not unban ${userId}:`, e.message);
        }
        timedBans.delete(userId);
      }
    }
  }, 10000);
});

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function parseDuration(str) {
  if (!str) return null;
  const s = str.toLowerCase().trim();
  if (s === 'month' || s === '1month' || s === '31d' || s === '31days') {
    return 31 * 24 * 60 * 60 * 1000;
  }
  const match = s.match(/^(\d+)(s|sec|secs|m|min|mins|h|hr|hrs|d|day|days)$/i);
  if (!match) return null;
  const val = parseInt(match[1]);
  const unit = match[2][0].toLowerCase();
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const ms = val * map[unit];
  return Math.min(ms, 31 * 24 * 60 * 60 * 1000);
}

function formatDuration(ms) {
  if (!ms) return 'permanent';
  const sec = Math.floor(ms / 1000);
  if (sec < 60)   return `${sec} second${sec !== 1 ? 's' : ''}`;
  const min = Math.floor(sec / 60);
  if (min < 60)   return `${min} minute${min !== 1 ? 's' : ''}`;
  const hr = Math.floor(min / 60);
  if (hr < 24)    return `${hr} hour${hr !== 1 ? 's' : ''}`;
  const days = Math.floor(hr / 24);
  if (days === 31) return 'month';
  return `${days} day${days !== 1 ? 's' : ''}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// GROQ AI HELPER
// Calls the Groq API (free) and returns the assistant's reply text.
// Uses the ANTHROPIC_API_KEY variable — just paste your Groq key in there.
// ══════════════════════════════════════════════════════════════════════════════
async function askClaude(channelId, userMessage) {
  const history = aiConversations.get(channelId) || [];

  history.push({ role: 'user', content: userMessage });

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ANTHROPIC_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful AI assistant inside a Discord server. Be friendly, concise, and helpful. Format responses in a way that reads well in Discord (use **bold**, bullet points, and code blocks where appropriate).',
        },
        ...history,
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error: ${err}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';

  history.push({ role: 'assistant', content: reply });

  // Keep conversation history to last 20 messages to avoid token overflow
  if (history.length > 20) history.splice(0, history.length - 20);
  aiConversations.set(channelId, history);

  return reply;
}

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGE CREATE
// ══════════════════════════════════════════════════════════════════════════════
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // ── AI CHAT CHANNEL: relay messages to Claude ──────────────────────────────
  // If this message is in one of the private AI chat channels, send it to Claude
  if (aiConversations.has(message.channel.id) && !message.content.startsWith('.')) {
    // Ignore the system info messages sent when the channel was created
    if (message.content.startsWith('✅') || message.content.startsWith('❌')) return;

    try {
      await message.channel.sendTyping();
      const reply = await askClaude(message.channel.id, message.content);

      // Discord messages have a 2000 char limit — split if needed
      if (reply.length <= 2000) {
        await message.reply(reply);
      } else {
        const chunks = reply.match(/[\s\S]{1,1990}/g) || [reply];
        for (const chunk of chunks) {
          await message.channel.send(chunk);
        }
      }
    } catch (err) {
      console.error('Claude API error:', err);
      message.reply('❌ Sorry, something went wrong when contacting the AI. Please try again.');
    }
    return;
  }

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

  // ── .ai ────────────────────────────────────────────────────────────────────
  // Owner-only: deletes their message and posts an embed with a Create AI Chat button
  if (command === 'ai') {
    if (message.author.id !== message.guild.ownerId) {
      return message.reply('❌ Only the server owner can use this command.');
    }

    // Delete the owner's command message
    await message.delete().catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🤖 AI Assistant')
      .setDescription(
        'Do you need AI assistance for help with something? Well that\'s totally fine!\n\n' +
        'Just press the **Create AI Chat** button below and it will bring you to your own **private channel** to chat with AI to help you with whatever you need!\n\n' +
        '*Your conversation is private — only you and server staff can see it.*'
      )
      .setFooter({ text: 'Powered by Claude AI • made by Purpleskeleton__' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('create_ai_chat')
        .setLabel('✨ Create AI Chat')
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    return;
  }

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
      .setThumbnail(target.user.displayAvatarURL())
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
      .setThumbnail(target.user.displayAvatarURL())
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
    if (!target) return message.reply('❌ Please mention a user to ban.\nUsage: `.ban @user [duration] [reason]`\nDurations: `10s` `5m` `2h` `3d` `month`');

    let durationMs = null;
    let reasonStartIndex = 1;

    const possibleDuration = args[1];
    if (possibleDuration) {
      const parsed = parseDuration(possibleDuration);
      if (parsed !== null) {
        durationMs = parsed;
        reasonStartIndex = 2;
      }
    }

    const reason = args.slice(reasonStartIndex).join(' ') || 'No reason provided';
    const durationLabel = durationMs ? formatDuration(durationMs) : 'Permanent';

    try {
      await target.ban({ reason });
    } catch {
      return message.reply('❌ Could not ban that user. Check bot role position.');
    }

    if (durationMs) {
      timedBans.set(target.user.id, {
        guildId: message.guild.id,
        unbanAt: Date.now() + durationMs,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle(durationMs ? '⏱️ User Temporarily Banned' : '🔨 User Permanently Banned')
      .addFields(
        { name: 'User', value: `${target.user.username} (${target.user.id})` },
        { name: 'Moderator', value: `@${message.author.username}` },
        { name: 'Duration', value: durationLabel },
        { name: 'Reason', value: reason },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setFooter({ text: durationMs ? `Will be unbanned after ${durationLabel}` : 'Permanent ban' })
      .setTimestamp();
    message.channel.send({ embeds: [embed] });

    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🔨 You have been banned')
        .addFields(
          { name: 'Server', value: message.guild.name },
          { name: 'Duration', value: durationLabel },
          { name: 'Reason', value: reason },
        )
        .setTimestamp();
      await target.send({ embeds: [dmEmbed] });
    } catch {}
  }

  // ── .unban ─────────────────────────────────────────────────────────────────
  else if (command === 'unban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ You do not have permission to unban members.');
    }

    const userId = args[0];
    if (!userId) return message.reply('❌ Please provide a user ID to unban.\nUsage: `.unban <userId> [reason]`');

    const reason = args.slice(1).join(' ') || 'No reason provided';

    try {
      await message.guild.members.unban(userId, reason);
    } catch {
      return message.reply('❌ Could not unban that user. Make sure the ID is correct and they are actually banned.');
    }

    timedBans.delete(userId);

    const embed = new EmbedBuilder()
      .setColor(0x00FF99)
      .setTitle('✅ User Unbanned')
      .addFields(
        { name: 'User ID', value: userId },
        { name: 'Moderator', value: `@${message.author.username}` },
        { name: 'Reason', value: reason },
      )
      .setTimestamp();
    message.channel.send({ embeds: [embed] });
  }

  // ── .timeout ───────────────────────────────────────────────────────────────
  else if (command === 'timeout') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ You do not have permission to timeout members.');
    }
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Please mention a user to timeout.\nUsage: `.timeout @user [duration] [reason]`\nDurations: `10s` `5m` `2h` `3d` `month`');

    const durationStr = args[1] || '10m';
    const reason = args.slice(2).join(' ') || 'No reason provided';
    const durationMs = parseDuration(durationStr);
    if (!durationMs) return message.reply('❌ Invalid duration. Use e.g. `10s`, `5m`, `2h`, `3d`, `month`');

    const discordMax = 28 * 24 * 60 * 60 * 1000;
    const appliedMs = Math.min(durationMs, discordMax);

    try { await target.timeout(appliedMs, reason); } catch { return message.reply('❌ Could not timeout that user. Check bot role position.'); }

    const embed = new EmbedBuilder()
      .setColor(0xFFFF00)
      .setTitle('⏱️ User Timed Out')
      .addFields(
        { name: 'User', value: `${target.user.username} (${target.user.id})` },
        { name: 'Moderator', value: `@${message.author.username}` },
        { name: 'Duration', value: formatDuration(durationMs) },
        { name: 'Reason', value: reason },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();
    message.channel.send({ embeds: [embed] });

    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xFFFF00)
        .setTitle('⏱️ You have been timed out')
        .addFields(
          { name: 'Server', value: message.guild.name },
          { name: 'Duration', value: formatDuration(durationMs) },
          { name: 'Reason', value: reason },
        )
        .setTimestamp();
      await target.send({ embeds: [dmEmbed] });
    } catch {}
  }

  // ── .untimeout ─────────────────────────────────────────────────────────────
  else if (command === 'untimeout') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ You do not have permission to remove timeouts.');
    }
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Please mention a user to remove the timeout from.\nUsage: `.untimeout @user [reason]`');

    const reason = args.slice(1).join(' ') || 'No reason provided';

    try {
      await target.timeout(null, reason);
    } catch {
      return message.reply('❌ Could not remove timeout. Check bot role position.');
    }

    const embed = new EmbedBuilder()
      .setColor(0x00FF99)
      .setTitle('✅ Timeout Removed')
      .addFields(
        { name: 'User', value: `${target.user.username} (${target.user.id})` },
        { name: 'Moderator', value: `@${message.author.username}` },
        { name: 'Reason', value: reason },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();
    message.channel.send({ embeds: [embed] });

    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0x00FF99)
        .setTitle('✅ Your timeout has been removed')
        .addFields(
          { name: 'Server', value: message.guild.name },
          { name: 'Reason', value: reason },
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

  // ── Create AI Chat button ──────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'create_ai_chat') {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const user = interaction.user;

    // Check if user already has an open AI chat
    if (aiChatChannels.has(user.id)) {
      const existing = guild.channels.cache.get(aiChatChannels.get(user.id));
      if (existing) {
        return interaction.editReply(`❌ You already have an open AI chat: ${existing}\nPlease use that channel or close it first.`);
      } else {
        // Channel was deleted externally — clean up the map
        aiChatChannels.delete(user.id);
        aiConversations.delete(aiChatChannels.get(user.id));
      }
    }

    // Find or skip "AI Chats" category
    const category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('ai')
    );

    // Permission overwrites: private to just this user + staff
    const permissionOverwrites = [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      {
        id: user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
    ];

    // Give access to any role with ManageChannels (staff/mods)
    guild.roles.cache.forEach(role => {
      if (role.permissions.has(PermissionFlagsBits.ManageChannels)) {
        permissionOverwrites.push({
          id: role.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        });
      }
    });

    let channel;
    try {
      channel = await guild.channels.create({
        name: `ai-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        type: ChannelType.GuildText,
        parent: category?.id,
        permissionOverwrites,
        topic: `Private AI chat for ${user.username} (${user.id})`,
      });
    } catch (err) {
      console.error('Failed to create AI chat channel:', err);
      return interaction.editReply('❌ Failed to create your AI chat channel. Please contact a server admin.');
    }

    aiChatChannels.set(user.id, channel.id);
    aiConversations.set(channel.id, []); // Start fresh conversation history

    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🤖 Your Private AI Chat')
      .setDescription(
        `Welcome <@${user.id}>! 👋\n\n` +
        'You can now chat with AI here. Just type your message and the AI will respond!\n\n' +
        '**Tips:**\n' +
        '• Ask anything — the AI remembers the conversation context\n' +
        '• Be as specific as possible for the best answers\n' +
        '• When you\'re done, click **Close AI Chat** below\n\n' +
        '*This channel is private — only you and staff can see it.*'
      )
      .setThumbnail(user.displayAvatarURL())
      .setFooter({ text: 'Powered by Claude AI • made by Purpleskeleton__' })
      .setTimestamp();

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`close_ai_chat_${user.id}`)
        .setLabel('🔒 Close AI Chat')
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({ content: `<@${user.id}>`, embeds: [welcomeEmbed], components: [closeRow] });
    await interaction.editReply(`✅ Your private AI chat has been created: ${channel}`);
    return;
  }

  // ── Close AI Chat button ───────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith('close_ai_chat_')) {
    const ownerId = interaction.customId.replace('close_ai_chat_', '');

    // Only the channel owner or staff can close it
    const isOwner = interaction.user.id === ownerId;
    const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

    if (!isOwner && !isStaff) {
      return interaction.reply({ content: '❌ Only the channel owner or staff can close this chat.', ephemeral: true });
    }

    await interaction.reply({ content: '🔒 Closing your AI chat in 5 seconds...' });

    const closeEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🔒 AI Chat Closed')
      .addFields({ name: 'Closed by', value: `@${interaction.user.username}` })
      .setTimestamp();

    await interaction.channel.send({ embeds: [closeEmbed] });

    // Clean up maps
    aiChatChannels.delete(ownerId);
    aiConversations.delete(interaction.channel.id);

    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    return;
  }

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
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({
        content: '❌ Only moderators can close tickets.',
        ephemeral: true,
      });
    }

    const ticketOwnerId = interaction.customId.replace('close_ticket_', '');

    const modal = new ModalBuilder()
      .setCustomId(`close_ticket_modal_${ticketOwnerId}`)
      .setTitle('Close Ticket');

    const reasonInput = new TextInputBuilder()
      .setCustomId('close_reason')
      .setLabel('Why do you want to close this ticket?')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Describe your reason for closing this ticket...')
      .setMaxLength(1000)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    await interaction.showModal(modal);
  }

  // ── Close Ticket modal submit ──────────────────────────────────────────────
  else if (interaction.isModalSubmit() && interaction.customId.startsWith('close_ticket_modal_')) {
    const ticketOwnerId = interaction.customId.replace('close_ticket_modal_', '');
    const closeReason = interaction.fields.getTextInputValue('close_reason');

    await interaction.reply({
      content: `🔒 Ticket is being closed...\n**Reason:** ${closeReason}`,
    });

    const closeEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🔒 Ticket Closed')
      .addFields(
        { name: 'Closed by', value: `@${interaction.user.username}` },
        { name: 'Reason', value: closeReason },
      )
      .setTimestamp();

    await interaction.channel.send({ embeds: [closeEmbed] });

    try {
      const owner = await interaction.client.users.fetch(ticketOwnerId);
      const dmEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🔒 Your ticket has been closed')
        .addFields(
          { name: 'Closed by', value: `@${interaction.user.username}` },
          { name: 'Reason', value: closeReason },
        )
        .setTimestamp();
      await owner.send({ embeds: [dmEmbed] });
    } catch {}

    openTickets.delete(ticketOwnerId);
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
// GEOMETRY DASH MINI-GAME
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
