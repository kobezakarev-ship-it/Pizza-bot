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
  TextInputStyle
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// CONFIG
const TICKET_CATEGORY_NAME = "Tickets";
const LOG_CHANNEL_NAME = "ticket-logs";

// DATA
let ticketCount = 0;
const activeTickets = new Map();

// FORMAT NUMBER
function formatNumber(num) {
  return num.toString().padStart(2, '0');
}

// GET OR CREATE CATEGORY
async function getCategory(guild) {
  let category = guild.channels.cache.find(
    c => c.name === TICKET_CATEGORY_NAME && c.type === ChannelType.GuildCategory
  );

  if (!category) {
    category = await guild.channels.create({
      name: TICKET_CATEGORY_NAME,
      type: ChannelType.GuildCategory
    });
  }

  return category;
}

// GET OR CREATE LOG CHANNEL
async function getLogChannel(guild) {
  let channel = guild.channels.cache.find(
    c => c.name === LOG_CHANNEL_NAME
  );

  if (!channel) {
    channel = await guild.channels.create({
      name: LOG_CHANNEL_NAME,
      type: ChannelType.GuildText
    });
  }

  return channel;
}

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// PANEL COMMAND
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content === '.ticket') {

    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setTitle('🎫 Support Center')
      .setDescription(`
Click the button below to create a support ticket.

Our support team will be with you as fast as we can.
`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_ticket')
        .setLabel('Open Ticket')
        .setStyle(ButtonStyle.Primary)
    );

    message.channel.send({ embeds: [embed], components: [row] });
  }
});

// INTERACTIONS
client.on('interactionCreate', async (interaction) => {

  // OPEN MODAL
  if (interaction.isButton() && interaction.customId === 'open_ticket') {

    const modal = new ModalBuilder()
      .setCustomId('ticket_modal')
      .setTitle('Create Ticket');

    const input = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('What do you need help with today?')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    return interaction.showModal(modal);
  }

  // CREATE TICKET
  if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {

    const reason = interaction.fields.getTextInputValue('reason');
    const user = interaction.user;
    const guild = interaction.guild;

    ticketCount++;
    const ticketNum = formatNumber(ticketCount);

    const category = await getCategory(guild);

    const channel = await guild.channels.create({
      name: `ticket-${ticketNum}`,
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

    activeTickets.set(channel.id, {
      owner: user.id,
      reason: reason,
      number: ticketNum
    });

    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setAuthor({
        name: user.tag,
        iconURL: user.displayAvatarURL()
      })
      .setTitle(`🎫 Ticket #${ticketNum}`)
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

  // CLOSE BUTTON
  if (interaction.isButton() && interaction.customId === 'close_ticket') {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return interaction.reply({
        content: '❌ You must have timeout permission to close tickets.',
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('close_modal')
      .setTitle('Close Ticket');

    const input = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Why do you want to close this ticket?')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    return interaction.showModal(modal);
  }

  // CLOSE MODAL
  if (interaction.isModalSubmit() && interaction.customId === 'close_modal') {

    const reason = interaction.fields.getTextInputValue('reason');
    const channel = interaction.channel;
    const guild = interaction.guild;

    const ticketData = activeTickets.get(channel.id);

    // FETCH MESSAGES FOR TRANSCRIPT
    let messages = await channel.messages.fetch({ limit: 100 });
    messages = messages.map(m => `${m.author.tag}: ${m.content}`).reverse().join('\n');

    const logChannel = await getLogChannel(guild);

    const logEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle(`📁 Ticket Closed #${ticketData?.number || "Unknown"}`)
      .addFields(
        { name: 'Closed By', value: `<@${interaction.user.id}>` },
        { name: 'Reason', value: reason }
      )
      .setTimestamp();

    logChannel.send({
      embeds: [logEmbed],
      files: [
        {
          attachment: Buffer.from(messages, 'utf-8'),
          name: `transcript-${channel.name}.txt`
        }
      ]
    });

    await interaction.reply({
      content: `🔒 Closing ticket...\nReason: ${reason}`
    });

    setTimeout(() => {
      channel.delete().catch(() => {});
    }, 4000);
  }

});

client.login('YOUR_BOT_TOKEN');
