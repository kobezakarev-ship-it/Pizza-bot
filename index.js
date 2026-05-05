const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Partials,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const PREFIX = '.';
const warnings = {};
const tickets = {};
const gdGames = {};
let ticketCount = 0;

client.once('ready', () => {
  console.log(`🍕 Pizza Bot is online as ${client.user.tag}!`);
});

// ───── GD GAME ─────
function buildGDRow(dead = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('gd_jump')
      .setLabel('🟦 JUMP')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(dead),
    new ButtonBuilder()
      .setCustomId('gd_retry')
      .setLabel('🔄 Retry')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!dead)
  );
}

function buildGDDisplay(player, spike, jumped, score) {
  let ground = '', air = '';
  for (let i = 0; i < 10; i++) {
    if (i === spike) {
      ground += '🔺'; air += '⬛';
    } else if (i === player && !jumped) {
      ground += '🟦'; air += '⬛';
    } else if (i === player && jumped) {
      ground += '⬛'; air += '🟦';
    } else {
      ground += '⬛'; air += '⬛';
    }
  }
  return `${air}\n${ground}\nScore: ${score}`;
}

function startGD(id, msg) {
  const g = gdGames[id];
  g.interval = setInterval(async () => {
    if (!gdGames[id] || g.dead) return;

    g.spike--;
    if (g.spike < 0) {
      g.spike = 9;
      g.score++;
      g.jumped = false;
    }

    if (g.spike === g.player && !g.jumped) {
      g.dead = true;
      clearInterval(g.interval);
      return msg.edit({
        content: `💀 You died! Score: ${g.score}`,
        components: [buildGDRow(true)],
      });
    }

    await msg.edit({
      content: `🎮 Geometry Dash\n${buildGDDisplay(g.player, g.spike, g.jumped, g.score)}`,
      components: [buildGDRow(false)],
    });

  }, 1500);
}

// ───── COMMANDS ─────
client.on('messageCreate', async (message) => {
  if (!message.content.startsWith(PREFIX) || message.author.bot) return;

  const args = message.content.slice(PREFIX.length).split(/ +/);
  const cmd = args.shift().toLowerCase();

  // GD
  if (cmd === 'gd') {
    const msg = await message.channel.send({
      content: `🎮 Geometry Dash\n${buildGDDisplay(2,8,false,0)}`,
      components: [buildGDRow()],
    });

    gdGames[msg.id] = {
      player: 2,
      spike: 8,
      jumped: false,
      score: 0,
      dead: false,
      user: message.author.id,
    };

    startGD(msg.id, msg);
  }

  // SETUP
  else if (cmd === 'setup') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply('❌ Admin only');

    const embed = new EmbedBuilder()
      .setTitle('🎫 Tickets')
      .setDescription('Click below to open a ticket')
      .setColor(0xff6600);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_open')
        .setLabel('Create Ticket')
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
  }

  // WARN
  else if (cmd === 'warn') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return;

    const user = message.mentions.members.first();
    if (!user) return;

    const reason = args.slice(1).join(' ') || 'No reason';

    const g = message.guild.id;
    warnings[g] ??= {};
    warnings[g][user.id] ??= 0;
    warnings[g][user.id]++;

    await user.timeout(3600000, reason).catch(()=>{});
    message.channel.send(`⚠️ ${user} warned (${warnings[g][user.id]}/3)`);

    if (warnings[g][user.id] >= 3) {
      await user.ban({ reason: '3 warnings' });
      warnings[g][user.id] = 0;
    }
  }

  // BAN
  else if (cmd === 'ban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return;

    const user = message.mentions.members.first();
    if (!user) return;

    await user.ban().catch(()=>{});
    message.channel.send(`🔨 Banned ${user.user.tag}`);
  }

  // KICK
  else if (cmd === 'kick') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers))
      return;

    const user = message.mentions.members.first();
    if (!user) return;

    await user.kick().catch(()=>{});
    message.channel.send(`👢 Kicked ${user.user.tag}`);
  }

  // TIMEOUT
  else if (cmd === 'timeout') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return;

    const user = message.mentions.members.first();
    const minutes = parseInt(args[1]);
    if (!user || isNaN(minutes)) return;

    await user.timeout(minutes * 60000).catch(()=>{});
    message.channel.send(`⏳ ${user} timed out for ${minutes}m`);
  }

  // DM ALL
  else if (cmd === 'dmall') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
      return;

    const text = args.join(' ');
    if (!text) return;

    const members = await message.guild.members.fetch();

    for (const [, m] of members) {
      if (!m.user.bot) {
        await m.send(text).catch(()=>{});
      }
    }

    message.reply('✅ Sent');
  }

  // CLOSE
  else if (cmd === 'close') {
    await message.channel.send('Closing...');
    setTimeout(() => message.channel.delete(), 3000);
  }
});

// ───── INTERACTIONS ─────
client.on('interactionCreate', async (i) => {

  if (i.isButton()) {

    // GD jump
    if (i.customId === 'gd_jump') {
      const g = gdGames[i.message.id];
      if (!g || i.user.id !== g.user) return;
      g.jumped = true;
      return i.deferUpdate();
    }

    // GD retry
    if (i.customId === 'gd_retry') {
      const msg = i.message;

      gdGames[msg.id] = {
        player: 2,
        spike: 8,
        jumped: false,
        score: 0,
        dead: false,
        user: i.user.id,
      };

      await i.update({
        content: `🎮 Geometry Dash\n${buildGDDisplay(2,8,false,0)}`,
        components: [buildGDRow()],
      });

      startGD(msg.id, msg);
    }

    // open ticket
    if (i.customId === 'ticket_open') {
      const modal = new ModalBuilder()
        .setCustomId('ticket_modal')
        .setTitle('Ticket');

      const input = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Your issue')
        .setStyle(TextInputStyle.Paragraph);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return i.showModal(modal);
    }

    // close ticket button
    if (i.customId.startsWith('close_ticket')) {
      awai
