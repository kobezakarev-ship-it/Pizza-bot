// ================= IMPORTS =================
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

const fs = require('fs');

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================= CONFIG =================
const CONFIG = {
  CATEGORY: "tickets",
  LOGS: "ticket-logs",
  STAFF_ROLE: "Support",
  DB_FILE: "./tickets.json"
};

// ================= DATABASE =================
let db = { users: {}, tickets: {} };

if (fs.existsSync(CONFIG.DB_FILE)) {
  db = JSON.parse(fs.readFileSync(CONFIG.DB_FILE));
}

function saveDB() {
  fs.writeFileSync(CONFIG.DB_FILE, JSON.stringify(db, null, 2));
}

// ================= UTIL =================
function pad(num) {
  return num.toString().padStart(2, '0');
}

async function getCategory(guild) {
  let cat = guild.channels.cache.find(c => c.name === CONFIG.CATEGORY);
  if (!cat) {
    cat = await guild.channels.create({
      name: CONFIG.CATEGORY,
      type: ChannelType.GuildCategory
    });
  }
  return cat;
}

async function getLogs(guild) {
  let log = guild.channels.cache.find(c => c.name === CONFIG.LOGS);
  if (!log) {
    log = await guild.channels.create({
      name: CONFIG.LOGS,
      type: ChannelType.GuildText
    });
  }
  return log;
}

function isStaff(member) {
  return member.roles.cache.some(r => r.name === CONFIG.STAFF_ROLE);
}

// ================= READY =================
client.once('ready', () => {
  console.log(`✅ ${client.user.tag} ready`);
});

// ================= PANEL =================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;

  if (msg.content === ".ticket") {
    const embed = new EmbedBuilder()
      .setTitle("🎫 Support Panel")
      .setDescription("Click below to open a ticket.\n\nOur support team will be with you as fast as we can.");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("open_ticket")
        .setLabel("Open Ticket")
        .setStyle(ButtonStyle.Primary)
    );

    msg.channel.send({ embeds: [embed], components: [row] });
  }
});

// ================= INTERACTIONS =================
client.on('interactionCreate', async (interaction) => {
  try {

    // OPEN BUTTON
    if (interaction.isButton() && interaction.customId === "open_ticket") {
      const modal = new ModalBuilder()
        .setCustomId("ticket_modal")
        .setTitle("Create Ticket");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Explain your issue")
            .setStyle(TextInputStyle.Paragraph)
        )
      );

      return interaction.showModal(modal);
    }

    // CREATE
    if (interaction.isModalSubmit() && interaction.customId === "ticket_modal") {

      await interaction.deferReply({ ephemeral: true });

      const reason = interaction.fields.getTextInputValue("reason");
      const user = interaction.user;
      const guild = interaction.guild;

      if (!db.users[user.id]) db.users[user.id] = 0;
      db.users[user.id]++;

      const num = pad(db.users[user.id]);
      const category = await getCategory(guild);

      const channel = await guild.channels.create({
        name: `ticket-${num}`,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
          }
        ]
      });

      db.tickets[channel.id] = {
        owner: user.id,
        number: num,
        open: true
      };

      saveDB();

      const embed = new EmbedBuilder()
        .setTitle(`Ticket #${num}`)
        .setDescription(`\`\`\`${reason}\`\`\`\n\nOur support team will be with you as fast as we can.\n\nDo not ping staff repeatedly. Stay patient and we will be with you when we can.`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("close").setLabel("Close").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("reopen").setLabel("Reopen").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("delete").setLabel("Delete").setStyle(ButtonStyle.Secondary)
      );

      await channel.send({ content: `<@${user.id}>`, embeds: [embed], components: [row] });

      interaction.editReply(`✅ Created ${channel}`);
    }

    // CLOSE
    if (interaction.isButton() && interaction.customId === "close") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "No permission", ephemeral: true });

      await interaction.deferReply();

      const channel = interaction.channel;
      db.tickets[channel.id].open = false;
      saveDB();

      await channel.send("🔒 Ticket closed.");
    }

    // REOPEN
    if (interaction.isButton() && interaction.customId === "reopen") {
      if (!isStaff(interaction.member)) return;

      db.tickets[interaction.channel.id].open = true;
      saveDB();

      interaction.reply("🔓 Reopened.");
    }

    // DELETE
    if (interaction.isButton() && interaction.customId === "delete") {
      if (!isStaff(interaction.member)) return;

      await interaction.reply("Deleting in 3s...");
      setTimeout(() => interaction.channel.delete(), 3000);
    }

  } catch (e) {
    console.error(e);
    if (!interaction.replied) {
      interaction.reply({ content: "Error", ephemeral: true });
    }
  }
});

// ================= LOGIN =================
client.login(process.env.DISCORD_TOKEN);
