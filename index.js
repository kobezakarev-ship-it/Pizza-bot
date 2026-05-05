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

// ─── Geometry Dash helpers ─────────────────────────

function buildGDRow(dead = false, won = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('gd_jump')
      .setLabel('🟦 JUMP!')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(dead || won),
    new ButtonBuilder()
      .setCustomId('gd_retry')
      .setLabel('🔄 Play Again')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!dead && !won)
  );
}

function buildGDDisplay(playerPos, spikePos, jumped, score) {
  let ground = '';
  let air = '';

  for (let i = 0; i < 10; i++) {
    if (i === spikePos) {
      ground += '🔺';
      air += '⬛';
    } else if (i === playerPos && !jumped) {
      ground += '🟦';
      air += '⬛';
    } else if (i === playerPos && jumped) {
      ground += '⬛';
      air += '🟦';
    } else {
      ground += '⬛';
      air += '⬛';
    }
  }

  return `${air}\n${ground}\n**Score: ${score}**`;
}

function startGDInterval(msgId, messageRef) {
  const game = gdGames[msgId];
  if (!game) return;

  game.interval = setInterval(async () => {
    try {
      const g = gdGames[msgId];
      if (!g || g.dead) return;

      g.spikePos--;

      if (g.spikePos < 0) {
        g.spikePos = 9;
        g.score++;
        g.jumped = false;
      }

      const hit = g.spikePos === g.playerPos && !g.jumped;
      const justPassed = g.spikePos === g.playerPos - 1;
      if (justPassed) g.jumped = false;

      if (hit) {
        g.dead = true;
        clearInterval(g.interval);

        await messageRef.edit({
          content: `💀 **YOU DIED!** Score: **${g.score}**\nPress Play Again!`,
          components: [buildGDRow(true, false)],
        });
      } else {
        const display = buildGDDisplay(g.playerPos, g.spikePos, g.jumped, g.score);

        await messageRef.edit({
          content: `🎮 **Geometry Dash**\n${display}`,
          components: [buildGDRow(false, false)],
        });
      }
    } catch (e) {
      console.log('GD interval error:', e.message);
      clearInterval(gdGames[msgId]?.interval);
      delete gdGames[msgId];
    }
  }, 1500);
}

// ─── Commands ─────────────────────────

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith(PREFIX) || message.author.bot) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // ── GD GAME ──
  if (command === 'gd') {
    const msg = await message.channel.send({
      content: `🎮 **Geometry Dash**\n${buildGDDisplay(2, 8, false, 0)}`,
      components: [buildGDRow()],
    });

    gdGames[msg.id] = {
      playerPos: 2,
      spikePos: 8,
      jumped: false,
      score: 0,
      userId: message.author.id,
      msgId: msg.id,
      dead: false,
    };

    startGDInterval(msg.id, msg);
  }

  // ── WARN ──
  else if (command === 'warn') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply('❌ No permission.');

    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Mention a user.');

    const reason = args.slice(1).join(' ') || 'No reason';

    const guildId = message.guild.id;
    const userId = target.id;

    if (!warnings[guildId]) warnings[guildId] = {};
    if (!warnings[guildId][userId]) warnings[guildId][userId] = 0;

    warnings[guildId][userId]++;
    const warnCount = warnings[guildId][userId];

    if (target.moderatable) {
      await target.timeout(60 * 60 * 1000, reason);
    }

    message.channel.send(`⚠️ ${target} warned (${warnCount}/3)`);

    if (warnCount >= 3) {
      await target.ban({ reason: '3 warnings' });
      warnings[guildId][userId] = 0;
    }
  }
});

// ─── Interactions ─────────────────────────

client.on('interactionCreate', async (interaction) => {

  if (interaction.isButton() && interaction.customId === 'gd_jump') {
    const game = gdGames[interaction.message.id];
    if (!game) return;

    if (interaction.user.id !== game.userId)
      return interaction.reply({ content: '❌ Not your game!', ephemeral: true });

    game.jumped = true;
    await interaction.deferUpdate();
  }

  else if (interaction.isButton() && interaction.customId === 'gd_retry') {
    const old = gdGames[interaction.message.id];
    if (old) clearInterval(old.interval);

    gdGames[interaction.message.id] = {
      playerPos: 2,
      spikePos: 8,
      jumped: false,
      score: 0,
      userId: interaction.user.id,
      msgId: interaction.message.id,
      dead: false,
    };

    await interaction.update({
      content: `🎮 **Geometry Dash**\n${buildGDDisplay(2, 8, false, 0)}`,
      components: [buildGDRow()],
    });

    startGDInterval(interaction.message.id, interaction.message);
  }
});

// ─── Error handling ─────────────────────────

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

client.login(process.env.TOKEN);
