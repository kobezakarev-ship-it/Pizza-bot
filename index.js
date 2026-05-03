const{Client,GatewayIntentBits,PermissionFlagsBits,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,ModalBuilder,TextInputBuilder,TextInputStyle}=require('discord.js');
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent,GatewayIntentBits.DirectMessages]});
const PREFIX='.';
const warnings={};
const tickets={};
let ticketCount=0;
client.once('ready',()=>{console.log(`🍕 Pizza Bot is online as ${client.user.tag}!`);});
client.on('messageCreate',async(message)=>{
if(!message.content.startsWith(PREFIX)||message.author.bot)return;
const args=message.content.slice(PREFIX.length).trim().split(/ +/);
const command=args.shift().toLowerCase();
if(command==='setup'){
if(!message.member.permissions.has(PermissionFlagsBits.Administrator))return message.reply('❌ Admins only.');
const embed=new EmbedBuilder().setTitle('🍕 Support Tickets').setDescription('Need assistance? Click the button below to open a ticket and our team will help you as soon as possible.\n\n**How to behave in a ticket:**\nBe respectful and patient with our staff.\nProvide all relevant information upfront.\nDo not ping staff members repeatedly.\nStay on topic.').setColor(0xFF6600).setFooter({text:'Pizza Bot 🍕'});
const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('create_ticket').setLabel('Create Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'));
await message.channel.send({embeds:[embed],components:[row]});
await message.delete();
}
else if(command==='warn'){
if(!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))return message.reply('❌ No permission.');
const target=message.mentions.members.first();
if(!target)return message.reply('❌ Usage: .warn @user (reason optional)');
const reason=args.slice(1).join(' ')||'No reason provided';
const guildId=message.guild.id;
const userId=target.id;
if(!warnings[guildId])warnings[guildId]={};
if(!warnings[guildId][userId])warnings[guildId][userId]=0;
warnings[guildId][userId]++;
const warnCount=warnings[guildId][userId];
if(target.moderatable){try{await target.timeout(3600000,reason);}catch(e){console.log('Timeout error:',e.message);}}
const embed=new EmbedBuilder().setTitle('🍕 User Warned').setColor(0xFF6600).setThumbnail(target.user.displayAvatarURL()).addFields({name:'User',value:`${target}`,inline:true},{name:'Moderator',value:`${message.member}`,inline:true},{name:'Reason',value:reason},{name:'Active Warns',value:`${warnCount}/3`},{name:'Timeout',value:'1 hour'}).setTimestamp();
message.channel.send({embeds:[embed]});
if(warnCount>=3){try{await target.ban({reason:'3 warnings'});message.channel.send(`🍕 ${target.user.tag} banned for 3 warnings.`);warnings[guildId][userId]=0;}catch(e){}}
}
else if(command==='ban'){
if(!message.member.permissions.has(PermissionFlagsBits.BanMembers))return message.reply('❌ No permission.');
const target=message.mentions.members.first();
if(!target)return message.reply('❌ Usage: .ban @user (reason optional)');
const reason=args.slice(1).join(' ')||'No reason provided';
try{await target.ban({reason});const embed=new EmbedBuilder().setTitle('🍕 User Banned').setColor(0xFF0000).setThumbnail(target.user.displayAvatarURL()).addFields({name:'User',value:`${target.user.tag}`,inline:true},{name:'Moderator',value:`${message.member}`,inline:true},{name:'Reason',value:reason}).setTimestamp();message.channel.send({embeds:[embed]});}catch(e){message.reply('❌ Could not ban.');}
}
else if(command==='kick'){
if(!message.member.permissions.has(PermissionFlagsBits.KickMembers))return message.reply('❌ No permission.');
const target=message.mentions.members.first();
if(!target)return message.reply('❌ Usage: .kick @user (reason optional)');
const reason=args.slice(1).join(' ')||'No reason provided';
try{await target.kick(reason);const embed=new EmbedBuilder().setTitle('🍕 User Kicked').setColor(0xFFA500).setThumbnail(target.user.displayAvatarURL()).addFields({name:'User',value:`${target.user.tag}`,inline:true},{name:'Moderator',value:`${message.member}`,inline:true},{name:'Reason',value:reason}).setTimestamp();message.channel.send({embeds:[embed]});}catch(e){message.reply('❌ Could not kick.');}
}
else if(command==='timeout'){
if(!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))return message.reply('❌ No permission.');
const target=message.mentions.members.first();
if(!target)return message.reply('❌ Usage: .timeout @user minutes (reason optional)');
const minutes=parseInt(args[1]);
if(isNaN(minutes))return message.reply('❌ Provide valid minutes.');
const reason=args.slice(2).join(' ')||'No reason provided';
try{await target.timeout(minutes*60*1000,reason);const embed=new EmbedBuilder().setTitle('🍕 User Timed Out').setColor(0xFFFF00).setThumbnail(target.user.displayAvatarURL()).addFields({name:'User',value:`${target}`,inline:true},{name:'Moderator',value:`${message.member}`,inline:true},{name:'Duration',value:`${minutes} minutes`,inline:true},{name:'Reason',value:reason}).setTimestamp();message.channel.send({embeds:[embed]});}catch(e){message.reply('❌ Could not timeout.');}
}
else if(command==='dmall'){
if(!message.member.permissions.has(PermissionFlagsBits.Administrator))return message.reply('❌ Admins only.');
const dmMessage=args.join(' ');
if(!dmMessage)return message.reply('❌ Usage: .dmall message');
await message.reply('🍕 Sending DMs...');
const members=await message.guild.members.fetch();
let success=0,failed=0;
for(const[,member]of members){if(member.user.bot)continue;try{await member.send(`📢 **Message from ${message.guild.name}:**\n${dmMessage}`);success++;}catch{failed++;}}
message.channel.send(`🍕 Done! ✅ ${success} sent, ❌ ${failed} failed.`);
}
else if(command==='close'){
const guildId=message.guild.id;
const ownerEntry=Object.entries(tickets[guildId]||{}).find(([,chId])=>chId===message.channel.id);
if(!ownerEntry&&!message.member.permissions.has(PermissionFlagsBits.ManageChannels))return message.reply('❌ Not a ticket channel.');
await message.channel.send('🍕 Closing in 5 seconds...');
setTimeout(async()=>{if(ownerEntry)delete tickets[guildId][ownerEntry[0]];await message.channel.delete();},5000);
}
});
client.on('interactionCreate',async(interaction)=>{
if(interaction.isButton()&&interaction.customId==='create_ticket'){
const modal=new ModalBuilder().setCustomId('ticket_modal').setTitle('Open a Support Ticket');
const input=new TextInputBuilder().setCustomId('ticket_reason').setLabel('What do you need help with?').setStyle(TextInputStyle.Paragraph).setPlaceholder('Describe your issue or request in detail...').setMaxLength(1000).setRequired(true);
modal.addComponents(new ActionRowBuilder().addComponents(input));
await interaction.showModal(modal);
}
else if(interaction.isModalSubmit()&&interaction.customId==='ticket_modal'){
const guildId=interaction.guild.id;
const userId=interaction.user.id;
if(tickets[guildId]?.[userId]){await interaction.reply({content:`❌ You already have a ticket: <#${tickets[guildId][userId]}>`,ephemeral:true});return;}
const reason=interaction.fields.getTextInputValue('ticket_reason');
ticketCount++;
const ticketName=`ticket-${String(ticketCount).padStart(4,'0')}`;
try{
const ticketChannel=await interaction.guild.channels.create({name:ticketName,type:ChannelType.GuildText,permissionOverwrites:[{id:interaction.guild.id,deny:[PermissionFlagsBits.ViewChannel]},{id:userId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]}]});
if(!tickets[guildId])tickets[guildId]={};
tickets[guildId][userId]=ticketChannel.id;
const closeButton=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`close_ticket_${userId}`).setLabel('Close Ticket').setStyle(ButtonStyle.Danger));
const embed=new EmbedBuilder().setTitle(`🍕 Ticket #${String(ticketCount).padStart(4,'0')}`).setColor(0xFF6600).setThumbnail(interaction.user.displayAvatarURL()).setDescription(`Hello ${interaction.user}, welcome to your support ticket!`).addFields({name:'Your Request',value:reason},{name:'Rules',value:'Be respectful.\nStay on topic.\nDo not ping staff repeatedly.'}).setTimestamp();
await ticketChannel.send({content:`${interaction.user}`,embeds:[embed],components:[closeButton]});
await interaction.reply({content:`🍕 Ticket created: ${ticketChannel}`,ephemeral:true});
}catch(e){await interaction.reply({content:'❌ Could not create ticket.',ephemeral:true});console.error(e);}
}
else if(interaction.isButton()&&interaction.customId.startsWith('close_ticket_')){
const guildId=interaction.guild.id;
const ownerEntry=Object.entries(tickets[guildId]||{}).find(([,chId])=>chId===interaction.channel.id);
await interaction.reply('🍕 Closing in 5 seconds...');
setTimeout(async()=>{if(ownerEntry)delete tickets[guildId][ownerEntry[0]];await interaction.channel.delete();},5000);
}
});
client.login(process.env.TOKEN);
