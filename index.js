const {
Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder,
ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
ModalBuilder, TextInputBuilder, TextInputStyle
} = require(‘discord.js’);

const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMembers,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent,
GatewayIntentBits.DirectMessages
]
});

const PREFIX = ‘.’;
const warnings = {};
const tickets = {};
const gdGames = {};
let ticketCount = 0;

const xpData = {};
const levelUpChannels = {};

const XP_PER_MESSAGE = 15;
const XP_COOLDOWN_MS = 60000;
const BASE_XP_REQUIRED = 100;

function xpForLevel(level) {
return Math.floor(BASE_XP_REQUIRED * Math.pow(level, 1.5));
}

function totalXpForLevel(level) {
let total = 0;
for (let l = 1; l <= level; l++) total += xpForLevel(l);
return total;
}

function getLevelFromXP(totalXp) {
let level = 0, accumulated = 0;
while (true) {
const needed = xpForLevel(level + 1);
if (accumulated + needed > totalXp) break;
accumulated += needed;
level++;
}
return level;
}

function getProgressToNextLevel(totalXp) {
let level = 0, accumulated = 0;
while (true) {
const needed = xpForLevel(level + 1);
if (accumulated + needed > totalXp) return { current: totalXp - accumulated, needed };
accumulated += needed;
level++;
}
}

function ensureUser(guildId, userId) {
if (!xpData[guildId]) xpData[guildId] = {};
if (!xpData[guildId][userId]) xpData[guildId][userId] = { xp: 0, level: 0, lastMessage: 0 };
}

async function awardXP(message) {
const guildId = message.guild.id;
const userId = message.author.id;
const now = Date.now();
ensureUser(guildId, userId);
const user = xpData[guildId][userId];
if (now - user.lastMessage < XP_COOLDOWN_MS) return;
user.lastMessage = now;
user.xp += XP_PER_MESSAGE;
const newLevel = getLevelFromXP(user.xp);
if (newLevel > user.level) {
user.level = newLevel;
await sendLevelUp(message, newLevel);
}
}

async function sendLevelUp(message, newLevel) {
const guildId = message.guild.id;
const channelId = levelUpChannels[guildId];
const embed = new EmbedBuilder()
.setTitle(‘🍕 Level Up!’)
.setColor(0xFF6600)
.setThumbnail(message.author.displayAvatarURL())
.setDescription(`GG ${message.author}, you just hit **Level ${newLevel}**! 🎉`)
.addFields(
{ name: ‘User’, value: `${message.author.tag}`, inline: true },
{ name: ‘New Level’, value: `${newLevel}`, inline: true }
)
.setTimestamp();
if (channelId) {
const ch = message.guild.channels.cache.get(channelId);
if (ch) return ch.send({ embeds: [embed] });
}
message.channel.send({ embeds: [embed] });
}

function buildGDRow(dead = false, won = false) {
return new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId(‘gd_jump’).setLabel(‘🟦 JUMP!’).setStyle(ButtonStyle.Primary).setDisabled(dead || won),
new ButtonBuilder().setCustomId(‘gd_retry’).setLabel(‘🔄 Play Again’).setStyle(ButtonStyle.Success).setDisabled(!dead && !won)
);
}

function buildGDDisplay(playerPos, spikePos, jumped, score) {
let ground = ‘’, air = ‘’;
for (let i = 0; i < 10; i++) {
if (i === spikePos) { ground += ‘🔺’; air += ‘⬛’; }
else if (i === playerPos && !jumped) { ground += ‘🟦’; air += ‘⬛’; }
else if (i === playerPos && jumped) { ground += ‘⬛’; air += ‘🟦’; }
else { ground += ‘⬛’; air += ‘⬛’; }
}
return `${air}\n${ground}\n**Score: ${score}**`;
}

function startGDInterval(msgId, msgObj) {
const game = gdGames[msgId];
game.interval = setInterval(async () => {
try {
const g = gdGames[msgId];
if (!g || g.dead) return;
g.spikePos–;
if (g.spikePos < 0) { g.spikePos = 9; g.score++; g.jumped = false; }
const justPassed = g.spikePos === g.playerPos - 1;
if (justPassed) g.jumped = false;
const hit = g.spikePos === g.playerPos && !g.jumped;
if (hit) {
g.dead = true;
clearInterval(g.interval);
await msgObj.edit({ content: `💀 **YOU DIED!** Score: **${g.score}**\nPress Play Again to try again!`, components: [buildGDRow(true, false)] });
} else {
await msgObj.edit({ content: `🎮 **Geometry Dash**\n${buildGDDisplay(g.playerPos, g.spikePos, g.jumped, g.score)}`, components: [buildGDRow(false, false)] });
}
} catch (e) { clearInterval(game.interval); }
}, 1500);
}

client.once(‘ready’, () => {
console.log(`🍕 Pizza Bot is online as ${client.user.tag}!`);
});

client.on(‘messageCreate’, async (message) => {
if (message.author.bot || !message.guild) return;

if (!message.content.startsWith(PREFIX)) {
await awardXP(message);
return;
}

const args = message.content.slice(PREFIX.length).trim().split(/ +/);
const command = args.shift().toLowerCase();

if (command === ‘rank’) {
const target = message.mentions.members.first() || message.member;
const guildId = message.guild.id;
ensureUser(guildId, target.id);
const userData = xpData[guildId][target.id];
const { current, needed } = getProgressToNextLevel(userData.xp);
const filled = Math.round((current / needed) * 10);
const bar = ‘█’.repeat(filled) + ‘░’.repeat(10 - filled);
const embed = new EmbedBuilder()
.setTitle(`🍕 ${target.user.username}'s Rank`)
.setColor(0xFF6600)
.setThumbnail(target.user.displayAvatarURL())
.addFields(
{ name: ‘Level’, value: `${userData.level}`, inline: true },
{ name: ‘Total XP’, value: `${userData.xp}`, inline: true },
{ name: `Progress to Level ${userData.level + 1}`, value: `${bar}  ${current}/${needed} XP` }
)
.setTimestamp();
return message.channel.send({ embeds: [embed] });
}

if (command === ‘leaderboard’ || command === ‘lb’) {
const guildId = message.guild.id;
if (!xpData[guildId]) return message.reply(‘❌ No XP data yet.’);
const sorted = Object.entries(xpData[guildId]).sort(([, a], [, b]) => b.xp - a.xp).slice(0, 10);
const lines = await Promise.all(sorted.map(async ([uid, data], i) => {
let name;
try { const m = await message.guild.members.fetch(uid); name = m.user.username; }
catch { name = ‘Unknown’; }
const medals = [‘🥇’, ‘🥈’, ‘🥉’];
const prefix = medals[i] || `**${i + 1}.**`;
return `${prefix} ${name} — Level **${data.level}** (${data.xp} XP)`;
}));
const embed = new EmbedBuilder()
.setTitle(‘🍕 Server Leaderboard’)
.setColor(0xFF6600)
.setDescription(lines.join(’\n’))
.setTimestamp();
return message.channel.send({ embeds: [embed] });
}

if (command === ‘set_level’) {
if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
return message.reply(‘❌ No permission.’);
const target = message.mentions.members.first();
if (!target) return message.reply(‘❌ Usage: .set_level @user <level>’);
const level = parseInt(args[1]);
if (isNaN(level) || level < 0) return message.reply(‘❌ Provide a valid level (0 or higher).’);
const guildId = message.guild.id;
ensureUser(guildId, target.id);
const userData = xpData[guildId][target.id];
userData.xp = totalXpForLevel(level);
userData.level = level;
const embed = new EmbedBuilder()
.setTitle(‘🍕 Level Set’)
.setColor(0xFF6600)
.setThumbnail(target.user.displayAvatarURL())
.addFields(
{ name: ‘User’, value: `${target}`, inline: true },
{ name: ‘New Level’, value: `${level}`, inline: true },
{ name: ‘Moderator’, value: `${message.member}` }
)
.setTimestamp();
return message.channel.send({ embeds: [embed] });
}

if (command === ‘add_level’) {
if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
return message.reply(‘❌ No permission.’);
const target = message.mentions.members.first();
if (!target) return message.reply(‘❌ Usage: .add_level @user <amount>’);
const amount = parseInt(args[1]);
if (isNaN(amount) || amount <= 0) return message.reply(‘❌ Provide a valid positive number.’);
const guildId = message.guild.id;
ensureUser(guildId, target.id);
const userData = xpData[guildId][target.id];
const oldLevel = userData.level;
const newLevel = oldLevel + amount;
userData.level = newLevel;
const xpFloor = totalXpForLevel(newLevel);
if (userData.xp < xpFloor) userData.xp = xpFloor;
const embed = new EmbedBuilder()
.setTitle(‘🍕 Levels Added’)
.setColor(0xFF6600)
.setThumbnail(target.user.displayAvatarURL())
.addFields(
{ name: ‘User’, value: `${target}`, inline: true },
{ name: ‘Old Level’, value: `${oldLevel}`, inline: true },
{ name: ‘New Level’, value: `${newLevel}`, inline: true },
{ name: ‘Added’, value: `+${amount}`, inline: true },
{ name: ‘Moderator’, value: `${message.member}` }
)
.setTimestamp();
return message.channel.send({ embeds: [embed] });
}

if (command === ‘setup’) {
if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
return message.reply(‘❌ Admins only.’);
if (args[0]?.toLowerCase() === ‘levelup’) {
levelUpChannels[message.guild.id] = message.channel.id;
const embed = new EmbedBuilder()
.setTitle(‘🍕 Level-Up Channel Set’)
.setColor(0xFF6600)
.setDescription(`Level-up announcements will now be posted in ${message.channel}.`)
.setTimestamp();
return message.channel.send({ embeds: [embed] });
}
const embed = new EmbedBuilder()
.setTitle(‘🍕 Support Tickets’)
.setDescription(‘Need assistance? Click the button below to open a ticket and our team will help you as soon as possible.\n\n**How to behave in a ticket:**\nBe respectful and patient with our staff.\nProvide all relevant information upfront.\nDo not ping staff members repeatedly.\nStay on topic.’)
.setColor(0xFF6600)
.setFooter({ text: ‘Pizza Bot 🍕’ });
const row = new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId(‘create_ticket’).setLabel(‘Create Ticket’).setStyle(ButtonStyle.Primary).setEmoji(‘🎫’)
);
await message.channel.send({ embeds: [embed], components: [row] });
await message.delete();
return;
}

if (command === ‘gd’) {
const playerPos = 2, spikePos = 8, score = 0;
const msg = await message.channel.send({
content: `🎮 **Geometry Dash** - Press JUMP when the spike gets close!\n${buildGDDisplay(playerPos, spikePos, false, score)}`,
components: [buildGDRow()]
});
gdGames[msg.id] = { playerPos, spikePos, jumped: false, score, userId: message.author.id, msgId: msg.id, channelId: msg.channelId, dead: false, interval: null };
startGDInterval(msg.id, msg);
return;
}

if (command === ‘warn’) {
if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply(‘❌ No permission.’);
const target = message.mentions.members.first();
if (!target) return message.reply(‘❌ Usage: .warn @user <reason>’);
const reason = args.slice(1).join(’ ’) || ‘No reason provided’;
const guildId = message.guild.id, userId = target.id;
if (!warnings[guildId]) warnings[guildId] = {};
if (!warnings[guildId][userId]) warnings[guildId][userId] = 0;
warnings[guildId][userId]++;
const warnCount = warnings[guildId][userId];
try {
if (target.moderatable) await target.timeout(3600000, reason);
else message.channel.send(‘⚠️ Could not timeout - make sure my role is above theirs!’);
} catch (e) { message.channel.send(’⚠️ Timeout failed: ’ + e.message); }
const embed = new EmbedBuilder().setTitle(‘🍕 User Warned’).setColor(0xFF6600).setThumbnail(target.user.displayAvatarURL())
.addFields({ name: ‘User’, value: `${target}`, inline: true }, { name: ‘Moderator’, value: `${message.member}`, inline: true }, { name: ‘Reason’, value: reason }, { name: ‘Active Warns’, value: `${warnCount}/3` }, { name: ‘Timeout’, value: ‘1 hour’ }).setTimestamp();
message.channel.send({ embeds: [embed] });
if (warnCount >= 3) {
try { await target.ban({ reason: ‘3 warnings’ }); message.channel.send(`🍕 ${target.user.tag} banned for 3 warnings.`); warnings[guildId][userId] = 0; } catch (e) {}
}
return;
}

if (command === ‘ban’) {
if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply(‘❌ No permission.’);
const target = message.mentions.members.first();
if (!target) return message.reply(‘❌ Usage: .ban @user <reason>’);
const reason = args.slice(1).join(’ ’) || ‘No reason provided’;
try {
await target.ban({ reason });
const embed = new EmbedBuilder().setTitle(‘🍕 User Banned’).setColor(0xFF0000).setThumbnail(target.user.displayAvatarURL())
.addFields({ name: ‘User’, value: `${target.user.tag}`, inline: true }, { name: ‘Moderator’, value: `${message.member}`, inline: true }, { name: ‘Reason’, value: reason }).setTimestamp();
message.channel.send({ embeds: [embed] });
} catch (e) { message.reply(‘❌ Could not ban.’); }
return;
}

if (command === ‘kick’) {
if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply(‘❌ No permission.’);
const target = message.mentions.members.first();
if (!target) return message.reply(‘❌ Usage: .kick @user <reason>’);
const reason = args.slice(1).join(’ ’) || ‘No reason provided’;
try {
await target.kick(reason);
const embed = new EmbedBuilder().setTitle(‘🍕 User Kicked’).setColor(0xFFA500).setThumbnail(target.user.displayAvatarURL())
.addFields({ name: ‘User’, value: `${target.user.tag}`, inline: true }, { name: ‘Moderator’, value: `${message.member}`, inline: true }, { name: ‘Reason’, value: reason }).setTimestamp();
message.channel.send({ embeds: [embed] });
} catch (e) { message.reply(‘❌ Could not kick.’); }
return;
}

if (command === ‘timeout’) {
if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply(‘❌ No permission.’);
const target = message.mentions.members.first();
if (!target) return message.reply(‘❌ Usage: .timeout @user <minutes> <reason>’);
const minutes = parseInt(args[1]);
if (isNaN(minutes)) return message.reply(‘❌ Provide valid minutes.’);
const reason = args.slice(2).join(’ ’) || ‘No reason provided’;
try {
await target.timeout(minutes * 60 * 1000, reason);
const embed = new EmbedBuilder().setTitle(‘🍕 User Timed Out’).setColor(0xFFFF00).setThumbnail(target.user.displayAvatarURL())
.addFields({ name: ‘User’, value: `${target}`, inline: true }, { name: ‘Moderator’, value: `${message.member}`, inline: true }, { name: ‘Duration’, value: `${minutes} minutes`, inline: true }, { name: ‘Reason’, value: reason }).setTimestamp();
message.channel.send({ embeds: [embed] });
} catch (e) { message.reply(‘❌ Could not timeout.’); }
return;
}

if (command === ‘dmall’) {
if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply(‘❌ Admins only.’);
const dmMessage = args.join(’ ’);
if (!dmMessage) return message.reply(‘❌ Usage: .dmall <message>’);
await message.reply(‘🍕 Sending DMs…’);
const members = await message.guild.members.fetch();
let success = 0, failed = 0;
for (const [, member] of members) {
if (member.user.bot) continue;
try { await member.send(`📢 **Message from ${message.guild.name}:**\n${dmMessage}`); success++; }
catch { failed++; }
}
message.channel.send(`🍕 Done! ✅ ${success} sent, ❌ ${failed} failed.`);
return;
}

if (command === ‘close’) {
const guildId = message.guild.id;
const ownerEntry = Object.entries(tickets[guildId] || {}).find(([, chId]) => chId === message.channel.id);
if (!ownerEntry && !message.member.permissions.has(PermissionFlagsBits.ManageChannels))
return message.reply(‘❌ Not a ticket channel.’);
await message.channel.send(‘🍕 Closing in 5 seconds…’);
setTimeout(async () => {
if (ownerEntry) delete tickets[guildId][ownerEntry[0]];
await message.channel.delete();
}, 5000);
}
});

client.on(‘interactionCreate’, async (interaction) => {

if (interaction.isButton() && interaction.customId === ‘gd_jump’) {
const game = Object.values(gdGames).find(g => g.msgId === interaction.message.id);
if (!game) return interaction.reply({ content: ‘❌ Game not found!’, ephemeral: true });
if (interaction.user.id !== game.userId) return interaction.reply({ content: ‘❌ This is not your game!’, ephemeral: true });
game.jumped = true;
await interaction.deferUpdate();
}

else if (interaction.isButton() && interaction.customId === ‘gd_retry’) {
const old = Object.values(gdGames).find(g => g.msgId === interaction.message.id);
if (old) { clearInterval(old.interval); delete gdGames[old.msgId]; }
const msgId = interaction.message.id;
const playerPos = 2, spikePos = 8, score = 0;
await interaction.update({
content: `🎮 **Geometry Dash** - Press JUMP when the spike gets close!\n${buildGDDisplay(playerPos, spikePos, false, score)}`,
components: [buildGDRow()]
});
gdGames[msgId] = { playerPos, spikePos, jumped: false, score, userId: interaction.user.id, msgId, channelId: interaction.channelId, dead: false, interval: null };
startGDInterval(msgId, interaction.message);
}

else if (interaction.isButton() && interaction.customId === ‘create_ticket’) {
const modal = new ModalBuilder().setCustomId(‘ticket_modal’).setTitle(‘Open a Support Ticket’);
const input = new TextInputBuilder()
.setCustomId(‘ticket_reason’).setLabel(‘What do you need help with?’)
.setStyle(TextInputStyle.Paragraph).setPlaceholder(‘Describe your issue or request in detail…’)
.setMaxLength(1000).setRequired(true);
modal.addComponents(new ActionRowBuilder().addComponents(input));
await interaction.showModal(modal);
}

else if (interaction.isModalSubmit() && interaction.customId === ‘ticket_modal’) {
const guildId = interaction.guild.id;
const userId = interaction.user.id;
if (tickets[guildId]?.[userId]) {
return interaction.reply({ content: `❌ You already have a ticket: <#${tickets[guildId][userId]}>`, ephemeral: true });
}
const reason = interaction.fields.getTextInputValue(‘ticket_reason’);
ticketCount++;
const ticketName = `ticket-${String(ticketCount).padStart(4, '0')}`;
try {
const ticketChannel = await interaction.guild.channels.create({
name: ticketName, type: ChannelType.GuildText,
permissionOverwrites: [
{ id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
{ id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
]
});
if (!tickets[guildId]) tickets[guildId] = {};
tickets[guildId][userId] = ticketChannel.id;
const closeButton = new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId(`close_ticket_${userId}`).setLabel(‘Close Ticket’).setStyle(ButtonStyle.Danger)
);
const embed = new EmbedBuilder()
.setTitle(`🍕 Ticket #${String(ticketCount).padStart(4, '0')}`).setColor(0xFF6600)
.setThumbnail(interaction.user.displayAvatarURL())
.setDescription(`Hello ${interaction.user}, welcome to your support ticket!`)
.addFields({ name: ‘Your Request’, value: reason }, { name: ‘Rules’, value: ‘Be respectful.\nStay on topic.\nDo not ping staff repeatedly.’ })
.setTimestamp();
await ticketChannel.send({ content: `${interaction.user}`, embeds: [embed], components: [closeButton] });
await interaction.reply({ content: `🍕 Ticket created: ${ticketChannel}`, ephemeral: true });
} catch (e) {
await interaction.reply({ content: ‘❌ Could not create ticket.’, ephemeral: true });
console.error(e);
}
}

else if (interaction.isButton() && interaction.customId.startsWith(‘close_ticket_’)) {
const guildId = interaction.guild.id;
const ownerEntry = Object.entries(tickets[guildId] || {}).find(([, chId]) => chId === interaction.channel.id);
await interaction.reply(‘🍕 Closing in 5 seconds…’);
setTimeout(async () => {
if (ownerEntry) delete tickets[guildId][ownerEntry[0]];
await interaction.channel.delete();
}, 5000);
}
});

client.login(process.env.TOKEN);
