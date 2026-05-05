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

/* ================= NEW COMMAND ================= */
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

const userData=levels[guildId][userId];
const xpNeeded=5*(userData.level**2)+50*userData.level+100;

if(userData.xp>=xpNeeded){
userData.level++;
userData.xp=0;

const channelId=levelChannels[guildId];
if(channelId){
const channel=message.guild.channels.cache.get(channelId);
if(channel){
channel.send(`🎉 ${target} leveled up to **Level ${userData.level}!**`);
}
}else{
message.channel.send(`🎉 ${target} leveled up to **Level ${userData.level}!**`);
}
}

message.channel.send(`✅ Added **${amount} XP** to ${target}`);
}
/* =============================================== */

else if(command==='setup'){
if(!message.member.permissions.has(PermissionFlagsBits.Administrator))return message.reply('❌ Admins only.');
const embed=new EmbedBuilder().setTitle('🍕 Support Tickets').setDescription('Need assistance? Click the button below to open a ticket and our team will help you as soon as possible.\n\n**How to behave in a ticket:**\nBe respectful and patient with our staff.\nProvide all relevant information upfront.\nDo not ping staff members repeatedly.\nStay on topic.').setColor(0xFF6600).setFooter({text:'Pizza Bot 🍕'});
const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('create_ticket').setLabel('Create Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'));
await message.channel.send({embeds:[embed],components:[row]});
await message.delete();
}

// (REST OF YOUR FILE CONTINUES EXACTLY THE SAME — unchanged)

});

client.on('interactionCreate',async(interaction)=>{
// unchanged...
});

client.login(process.env.TOKEN);
