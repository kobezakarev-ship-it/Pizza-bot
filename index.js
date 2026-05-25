const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* ================= CONFIG ================= */

const CONFIG = {
  ticketCategoryName: "tickets",
  logChannelName: "ticket-logs"
};

/* ================= DATA ================= */

let ticketCount = 0;
const tickets = new Map();

/* ================= UTIL ================= */

function formatNumber(num) {
  return num.toString().padStart(2, '0');
}

async function getOrCreateCategory(guild) {
  let category = guild.channels.cache.find(
    c => c.name === CONFIG.ticketCategoryName && c.type === ChannelType.GuildCategory
  );

  if (!category) {
    category = await guild.channels.create({
      name: CONFIG.ticketCategoryName,
      type: ChannelType.GuildCategory
    });
  }

  return category;
}

async function getOrCreateLogChannel(guild) {
  let channel = guild.channels.cache.find(
    c => c.name === CONFIG.logChannelName
  );

  if (!channel) {
    channel = await guild.channels.create({
      name: CONFIG.logChannelName,
      type: ChannelType.GuildText
    });
  }

  return channel;
}

/* ================= READY ================= */

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

/* ================= PANEL COMMAND ================= */

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content === '.ticket') {

    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setTitle('🎫 Support Panel')
      .setDescription(`
Click the button below to create a ticket.

Our support team will be with you as fast as we can.
`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_ticket')
        .setLabel('Open Ticket')
        .setStyle(ButtonStyle.Primary)
    );

    message.channel.send({
      embeds: [embed],
      components: [row]
    });
  }
});

/* ================= INTERACTIONS ================= */

client.on('interactionCreate', async (interaction) => {

  /* ---------- OPEN BUTTON ---------- */

  if (interaction.isButton() && interaction.customId === 'open_ticket') {

    const modal = new ModalBuilder()
      .setCustomId('ticket_modal')
      .setTitle('Create Ticket');

    const input = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('What do you need help with?')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(input)
    );

    return interaction.showModal(modal);
  }

  /* ---------- CREATE TICKET ---------- */

  if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {

    const reason = interaction.fields.getTextInputValue('reason');
    const guild = interaction.guild;
    const user = interaction.user;

    ticketCount++;
    const number = formatNumber(ticketCount);

    const category = await getOrCreateCategory(guild);

    const channel = await guild.channels.create({
      name: `ticket-${number}`,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
          ]
        }
      ]
    });

    tickets.set(channel.id, {
      owner: user.id,
      number,
      reason
    });

    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setAuthor({
        name: user.tag,
        iconURL: user.displayAvatarURL()
      })
      .setTitle(`🎫 Ticket #${number}`)
      .setDescription(`
**Request**
\`\`\`
${reason}
\`\`\`

Our support team will be with you as fast as we can.

**Rules**
> Do not ping staff repeatedly  
> Stay patient and we will be with you when we can
`)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒')
    );

    await channel.send({
      content: `<@${user.id}>`,
      embeds: [embed],
      components: [row]
    });

    await interaction.reply({
      content: `✅ Ticket created: ${channel}`,
      ephemeral: true
    });
  }

  /* ---------- CLOSE BUTTON ---------- */

  if (interaction.isButton() && interaction.customId === 'close_ticket') {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return interaction.reply({
        content: '❌ You need timeout permission to close tickets.',
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('close_modal')
      .setTitle('Close Ticket');

    const input = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason for closing')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(input)
    );

    return interaction.showModal(modal);
  }

  /* ---------- CLOSE HANDLER ---------- */

  if (interaction.isModalSubmit() && interaction.customId === 'close_modal') {

    const reason = interaction.fields.getTextInputValue('reason');
    const channel = interaction.channel;
    const guild = interaction.guild;

    const data = tickets.get(channel.id);

    // FETCH MESSAGES
    let msgs = await channel.messages.fetch({ limit: 100 });
    const content = msgs
      .map(m => `${m.author.tag}: ${m.content}`)
      .reverse()
      .join('\n');

    const buffer = Buffer.from(content, 'utf-8');
    const file = new AttachmentBuilder(buffer, {
      name: `transcript-${channel.name}.txt`
    });

    const logChannel = await getOrCreateLogChannel(guild);

    const logEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle(`📁 Ticket Closed #${data?.number || "??"}`)
      .addFields(
        { name: 'Closed By', value: `<@${interaction.user.id}>` },
        { name: 'Reason', value: reason }
      )
      .setTimestamp();

    await logChannel.send({
      embeds: [logEmbed],
      files: [file]
    });

    await interaction.reply({
      content: `🔒 Closing ticket...\nReason: ${reason}`
    });

    setTimeout(() => {
      channel.delete().catch(() => {});
    }, 4000);
  }

});

/* ================= LOGIN ================= */

client.login(process.env.DISCORD_TOKEN);
