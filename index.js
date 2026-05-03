const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require(‘discord.js’);

const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMembers,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent,
GatewayIntentBits.DirectMessages,
]
});

const TOKEN = ‘YOUR_BOT_TOKEN_HERE’; // Replace with your bot token
const PREFIX = ‘.’;

// Store warnings per user: { guildId: { userId: count } }
const warnings = {};

// Store open tickets: { guildId: { userId: channelId } }
const tickets = {};

let ticketCount = 0;

client.once(‘ready’, () => {
console.log(`🍕 Pizza Bot is online as ${client.user.tag}!`);
});

client.on(‘messageCreate’, async (message) => {
if (!message.content.startsWith(PREFIX) || message.author.bot) return;

const args = message.content.slice(PREFIX.length).trim().split(/ +/);
const command = args.shift().toLowerCase();

// ─── .warn ───────────────────────────────────────────────────────────
if (command === ‘warn’) {
if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
return message.reply(‘❌ You do not have permission to warn members.’);
}

```
const target = message.mentions.members.first();
if (!target) return message.reply('❌ Please mention a member to warn. Usage: `.warn @user reason`');

const reason = args.slice(1).join(' ') || 'No reason provided';
const guildId = message.guild.id;
const userId = target.id;

if (!warnings[guildId]) warnings[guildId] = {};
if (!warnings[guildId][userId]) warnings[guildId][userId] = 0;
warnings[guildId][userId]++;

const warnCount = warnings[guildId][userId];

// Timeout for 1 hour
try {
  await target.timeout(60 * 60 * 1000, reason);
} catch (e) {
  console.log('Could not timeout user:', e.message);
}

const embed = new EmbedBuilder()
  .setTitle('🍕 User Warned')
  .setColor(0xFF6600)
  .setThumbnail(target.user.displayAvatarURL())
  .addFields(
    { name: 'User', value: `${target}`, inline: true },
    { name: 'Moderator', value: `${message.member}`, inline: true },
    { name: 'Reason', value: reason },
    { name: 'Active Warns', value: `${warnCount}/3` },
    { name: 'Timeout', value: '1 hour' }
  )
  .setFooter({ text: 'Pizza Bot 🍕' })
  .setTimestamp();

message.channel.send({ embeds: [embed] });

if (warnCount >= 3) {
  try {
    await target.ban({ reason: 'Reached 3 warnings' });
    message.channel.send(`🍕 ${target.user.tag} has been **banned** for reaching 3 warnings.`);
    warnings[guildId][userId] = 0;
  } catch (e) {
    message.channel.send('⚠️ Could not auto-ban after 3 warns. Check my permissions.');
  }
}
```

}

// ─── .ban ─────────────────────────────────────────────────────────────
else if (command === ‘ban’) {
if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
return message.reply(‘❌ You do not have permission to ban members.’);
}

```
const target = message.mentions.members.first();
if (!target) return message.reply('❌ Please mention a member to ban. Usage: `.ban @user reason`');

const reason = args.slice(1).join(' ') || 'No reason provided';

try {
  await target.ban({ reason });
  const embed = new EmbedBuilder()
    .setTitle('🍕 User Banned')
    .setColor(0xFF0000)
    .setThumbnail(target.user.displayAvatarURL())
    .addFields(
      { name: 'User', value: `${target.user.tag}`, inline: true },
      { name: 'Moderator', value: `${message.member}`, inline: true },
      { name: 'Reason', value: reason }
    )
    .setFooter({ text: 'Pizza Bot 🍕' })
    .setTimestamp();
  message.channel.send({ embeds: [embed] });
} catch (e) {
  message.reply('❌ Could not ban that user. Check my permissions and role position.');
}
```

}

// ─── .kick ────────────────────────────────────────────────────────────
else if (command === ‘kick’) {
if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
return message.reply(‘❌ You do not have permission to kick members.’);
}

```
const target = message.mentions.members.first();
if (!target) return message.reply('❌ Please mention a member to kick. Usage: `.kick @user reason`');

const reason = args.slice(1).join(' ') || 'No reason provided';

try {
  await target.kick(reason);
  const embed = new EmbedBuilder()
    .setTitle('🍕 User Kicked')
    .setColor(0xFFA500)
    .setThumbnail(target.user.displayAvatarURL())
    .addFields(
      { name: 'User', value: `${target.user.tag}`, inline: true },
      { name: 'Moderator', value: `${message.member}`, inline: true },
      { name: 'Reason', value: reason }
    )
    .setFooter({ text: 'Pizza Bot 🍕' })
    .setTimestamp();
  message.channel.send({ embeds: [embed] });
} catch (e) {
  message.reply('❌ Could not kick that user. Check my permissions and role position.');
}
```

}

// ─── .timeout ─────────────────────────────────────────────────────────
else if (command === ‘timeout’) {
if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
return message.reply(‘❌ You do not have permission to timeout members.’);
}

```
const target = message.mentions.members.first();
if (!target) return message.reply('❌ Usage: `.timeout @user <minutes> reason`');

const minutes = parseInt(args[1]);
if (isNaN(minutes) || minutes < 1) return message.reply('❌ Please provide valid minutes. Example: `.timeout @user 30 spamming`');

const reason = args.slice(2).join(' ') || 'No reason provided';

try {
  await target.timeout(minutes * 60 * 1000, reason);
  const embed = new EmbedBuilder()
    .setTitle('🍕 User Timed Out')
    .setColor(0xFFFF00)
    .setThumbnail(target.user.displayAvatarURL())
    .addFields(
      { name: 'User', value: `${target}`, inline: true },
      { name: 'Moderator', value: `${message.member}`, inline: true },
      { name: 'Duration', value: `${minutes} minutes`, inline: true },
      { name: 'Reason', value: reason }
    )
    .setFooter({ text: 'Pizza Bot 🍕' })
    .setTimestamp();
  message.channel.send({ embeds: [embed] });
} catch (e) {
  message.reply('❌ Could not timeout that user. Check my permissions.');
}
```

}

// ─── .dmall ───────────────────────────────────────────────────────────
else if (command === ‘dmall’) {
if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
return message.reply(‘❌ Only admins can use `.dmall`.’);
}

```
const dmMessage = args.join(' ');
if (!dmMessage) return message.reply('❌ Please provide a message. Usage: `.dmall your message here`');

await message.reply('🍕 Sending DMs to all members...');

const members = await message.guild.members.fetch();
let success = 0, failed = 0;

for (const [, member] of members) {
  if (member.user.bot) continue;
  try {
    await member.send(`📢 **Message from ${message.guild.name}:**\n${dmMessage}`);
    success++;
  } catch {
    failed++;
  }
}

message.channel.send(`🍕 DMs sent! ✅ ${success} successful, ❌ ${failed} failed (users with DMs off).`);
```

}

// ─── .ticket ──────────────────────────────────────────────────────────
else if (command === ‘ticket’) {
const guildId = message.guild.id;
const userId = message.author.id;

```
if (tickets[guildId]?.[userId]) {
  return message.reply(`❌ You already have an open ticket: <#${tickets[guildId][userId]}>`);
}

ticketCount++;
const ticketName = `ticket-${String(ticketCount).padStart(4, '0')}`;

try {
  const ticketChannel = await message.guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: message.guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: userId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
    ],
  });

  if (!tickets[guildId]) tickets[guildId] = {};
  tickets[guildId][userId] = ticketChannel.id;

  const closeButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`close_ticket_${userId}`)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
  );

  const embed = new EmbedBuilder()
    .setTitle(`🍕 Ticket #${String(ticketCount).padStart(4, '0')}`)
    .setColor(0xFF6600)
    .setThumbnail(message.author.displayAvatarURL())
    .setDescription(`Hello ${message.author}, welcome to your support ticket!\nOur team will be with you shortly. Please provide as much detail as possible.`)
    .addFields(
      { name: 'Rules while in this ticket', value: 'Be respectful and patient.\nDo not ping staff repeatedly.\nStay on topic.' }
    )
    .setFooter({ text: `Ticket opened by ${message.author.tag} | Pizza Bot 🍕` })
    .setTimestamp();

  await ticketChannel.send({ content: `${message.author}`, embeds: [embed], components: [closeButton] });
  message.reply(`🍕 Your ticket has been created: ${ticketChannel}`);
} catch (e) {
  message.reply('❌ Could not create ticket. Make sure I have the right permissions.');
  console.error(e);
}
```

}

// ─── .close ───────────────────────────────────────────────────────────
else if (command === ‘close’) {
const guildId = message.guild.id;

```
// Find who owns this ticket channel
const ownerEntry = Object.entries(tickets[guildId] || {}).find(([, chId]) => chId === message.channel.id);

if (!ownerEntry && !message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
  return message.reply('❌ This is not a ticket channel or you cannot close it.');
}

await message.channel.send('🍕 Closing ticket in 5 seconds...');
setTimeout(async () => {
  if (ownerEntry) delete tickets[guildId][ownerEntry[0]];
  await message.channel.delete();
}, 5000);
```

}
});

// ─── Button interactions (Close Ticket button) ────────────────────────────────
client.on(‘interactionCreate’, async (interaction) => {
if (!interaction.isButton()) return;

if (interaction.customId.startsWith(‘close_ticket_’)) {
const guildId = interaction.guild.id;
const ownerEntry = Object.entries(tickets[guildId] || {}).find(([, chId]) => chId === interaction.channel.id);

```
await interaction.reply('🍕 Closing ticket in 5 seconds...');
setTimeout(async () => {
  if (ownerEntry) delete tickets[guildId][ownerEntry[0]];
  await interaction.channel.delete();
}, 5000);
```

}
});

client.login(TOKEN);
