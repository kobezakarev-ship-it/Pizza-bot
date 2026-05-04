const{Client,GatewayIntentBits,PermissionFlagsBits,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,ModalBuilder,TextInputBuilder,TextInputStyle}=require('discord.js');

const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent,GatewayIntentBits.DirectMessages]});

const PREFIX='.';
const warnings={};
const tickets={};
const gdGames={};
let ticketCount=0;

/* ================= LEVEL SYSTEM ================= */
const levels={};
const levelChannels={};
/* ================================================= */

client.once('ready',()=>{console.log(`🍕 Pizza Bot is online as ${client.user.tag}!`);});

function buildGDRow(dead=false,won=false){
return new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('gd_jump').setLabel('🟦 JUMP!').setStyle(ButtonStyle.Primary).setDisabled(dead||won),
new ButtonBuilder().setCustomId('gd_retry').setLabel('🔄 Play Again').setStyle(ButtonStyle.Success).setDisabled(!dead&&!won)
);}

function buildGDDisplay(playerPos,spikePos,jumped,score){
let ground='';
let air='';
for(let i=0;i<10;i++){
if(i===spikePos){ground+='🔺';air+='⬛';}
else if(i===playerPos&&!jumped){ground+='🟦';air+='⬛';}
else if(i===playerPos&&jumped){ground+='⬛';air+='🟦';}
else{ground+='⬛';air+='⬛';}}
return `${air}\n${ground}\n**Score: ${score}**`;}

client.on('messageCreate',async(message)=>{

if(message.author.bot)return;

/* ================= LEVEL SYSTEM RUN ================= */
if(message.guild){
const guildId=message.guild.id;
const userId=message.author.id;

if(!levels[guildId])levels[guildId]={};
if(!levels[guildId][userId])levels[guildId][userId]={xp:0,level:0};

const userData=levels[guildId][userId];

const xpGain=Math.floor(Math.random()*10)+5;
userData.xp+=xpGain;

const xpNeeded=5*(userData.level**2)+50*userData.level+100;

if(userData.xp>=xpNeeded){
userData.level++;
userData.xp=0;

const channelId=levelChannels[guildId];

if(channelId){
const channel=message.guild.channels.cache.get(channelId);
if(channel){
channel.send(`🎉 ${message.author} leveled up to **Level ${userData.level}!**`);
}
}else{
message.channel.send(`🎉 ${message.author} leveled up to **Level ${userData.level}!**`);
}
}
}
/* ==================================================== */

if(!message.content.startsWith(PREFIX))return;

const args=message.content.slice(PREFIX.length).trim().split(/ +/);
const command=args.shift().toLowerCase();

if(command==='gd'){
const playerPos=2;
const spikePos=8;
const score=0;
const display=buildGDDisplay(playerPos,spikePos,false,score);
const row=buildGDRow();
const msg=await message.channel.send({content:`🎮 **Geometry Dash** - Press JUMP when the spike gets close!\n${display}`,components:[row]});
gdGames[msg.id]={playerPos,spikePos,jumped:false,score,userId:message.author.id,msgId:msg.id,channelId:msg.channelId,dead:false,interval:null};
const game=gdGames[msg.id];
game.interval=setInterval(async()=>{
try{
const g=gdGames[msg.id];
if(!g||g.dead)return;
g.spikePos--;
if(g.spikePos<0){g.spikePos=9;g.score++;g.jumped=false;}
const hit=g.spikePos===g.playerPos&&!g.jumped;
const justPassed=g.spikePos===g.playerPos-1;
if(justPassed)g.jumped=false;
if(hit){
g.dead=true;
clearInterval(g.interval);
const row=buildGDRow(true,false);
await msg.edit({content:`💀 **YOU DIED!** Score: **${g.score}**\nPress Play Again to try again!`,components:[row]});
}else{
const display=buildGDDisplay(g.playerPos,g.spikePos,g.jumped,g.score);
const row=buildGDRow(false,false);
await msg.edit({content:`🎮 **Geometry Dash**\n${display}`,components:[row]});
}}catch(e){clearInterval(game.interval);}
},1500);
}

else if(command==='setupxp'){
if(!message.member.permissions.has(PermissionFlagsBits.Administrator))
return message.reply('❌ Admins only.');

levelChannels[message.guild.id]=message.channel.id;

message.reply('✅ Level-up messages will now be sent in this channel!');
}

/* ========= NEW COMMAND (THIS IS ALL THAT WAS ADDED) ========= */
else if(command==='set_xp_level'){
if(!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
return message.reply('❌ Mods only.');

const target=message.mentions.users.first();
if(!target) return message.reply('❌ Usage: .set_xp_level @user amount');

const amount=parseInt(args[1]);
if(isNaN(amount)) return message.reply('❌ Provide a valid number.');

const guildId=message.guild.id;
const userId=target.id;

if(!levels[guildId]) levels[guildId]={};
if(!levels[guildId][userId]) levels[guildId][userId]={xp:0,level:0};

levels[guildId][userId].xp+=amount;

// MULTI LEVEL SUPPORT (fixed)
let userData=levels[guildId][userId];
let xpNeeded=5*(userData.level**2)+50*userData.level+100;

while(userData.xp>=xpNeeded){
userData.xp-=xpNeeded;
userData.level++;
xpNeeded=5*(userData.level**2)+50*userData.level+100;
}

const channelId=levelChannels[guildId];
if(channelId){
const channel=message.guild.channels.cache.get(channelId);
if(channel){
channel.send(`🎉 ${target} is now **Level ${userData.level}!**`);
}
}
message.channel.send(`✅ Added **${amount} XP** to ${target}`);
}
/* ========================================================== */

else if(command==='setup'){
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
try{
if(target.moderatable){
await target.timeout(3600000,reason);
}else{
message.channel.send('⚠️ Could not timeout - make sure my role is above theirs!');
}
}catch(e){console.log('Timeout error:',e.message);message.channel.send('⚠️ Timeout failed: '+e.message);}
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
// unchanged
});

client.login(process.env.TOKEN);
