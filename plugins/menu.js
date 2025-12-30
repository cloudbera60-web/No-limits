const moment = require('moment-timezone');
const fs = require('fs');
const os = require('os');
const axios = require('axios');

const getUserStats = async (user) => {
  // This would normally fetch from a database
  // For now, return dummy data
  return { menuCount: 5 };
};

const menu = async (m, Matrix) => {
  const body = m.body ? m.body.toLowerCase().trim() : '';
  
  // Handle both "menu" command with prefix and direct number selection
  const prefix = process.env.BOT_PREFIX || '.';
  let cmd = '';
  let isNumberSelection = false;
  
  if (body.startsWith(prefix)) {
    cmd = body.slice(prefix.length).split(' ')[0].toLowerCase();
  } else if (/^[1-9]$|^10$/.test(body)) {
    cmd = body;
    isNumberSelection = true;
  } else if (body === 'menu') {
    cmd = 'menu';
  } else {
    return; // Not a menu command
  }

  const currentTime = moment().format('HH');
  let greeting = "Good Day";
  if (currentTime < 12) greeting = "Good Morning";
  else if (currentTime < 18) greeting = "Good Afternoon";
  else greeting = "Good Evening";

  const lastUpdated = moment().format('LLLL');
  const userStats = await getUserStats(m.sender);

  const mainMenu = `
✨ Welcome to ${process.env.BOT_NAME || 'GIFTED-MD'} ☁️ AI, ${m.pushName || 'User'}! ✨

🖐️ ${greeting}, ${m.pushName || 'User'}! 🎉 Bot is ready to assist you!

🕒 Last Updated: ${lastUpdated}
💻 User Stats: You've used this bot ${userStats.menuCount} times today!

🎯 Choose an option below to proceed:

📥 1. DOWNLOAD MENU
📱 2. CONVERTER MENU
🤖 3. AI MENU
🛠️ 4. TOOLS MENU
👥 5. GROUP MENU
🔍 6. SEARCH MENU
🏠 7. MAIN MENU
🧑‍💻 8. OWNER MENU
🕵️‍♂️ 9. STALK MENU
🎨 10. LOGO MENU

✏️ Please reply with a number (1–10) to open the submenu of your choice.`;

  const menuImageUrl = process.env.MENU_IMAGE || 'https://files.catbox.moe/7jt69h.jpg';

  if (cmd === 'menu' && !isNumberSelection) {
    try {
      await Matrix.sendMessage(m.from, {
        image: { url: menuImageUrl },
        caption: mainMenu,
        contextInfo: { 
          mentionedJid: [m.sender],
          forwardingScore: 999,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: '120363398040175935@newsletter',
            newsletterName: "JawadTechX",
            serverMessageId: 143
          }
        }
      }, { quoted: m });
    } catch (error) {
      // Fallback to text if image fails
      await Matrix.sendMessage(m.from, {
        text: mainMenu,
        contextInfo: { mentionedJid: [m.sender] }
      }, { quoted: m });
    }
    return;
  }

  const menus = {
    "1": `
🔽 DOWNLOAD MENU 🔽
• ${prefix}apk
• ${prefix}play
• ${prefix}video
• ${prefix}song
• ${prefix}mediafire
• ${prefix}pinterestdl
• ${prefix}insta
• ${prefix}ytmp3
• ${prefix}ytmp4`,

    "2": `
🔽 CONVERTER MENU 🔽
• ${prefix}attp
• ${prefix}ebinary
• ${prefix}dbinary
• ${prefix}emojimix
• ${prefix}mp3
• ${prefix}url`,

    "3": `
🔽 AI MENU 🔽
• ${prefix}ai
• ${prefix}sheng on/off
• ${prefix}report
• ${prefix}deepseek on/off
• ${prefix}dalle
• ${prefix}gemini
• ${prefix}define`,

    "4": `
🔽 TOOLS MENU 🔽
• ${prefix}calculator
• ${prefix}tempmail
• ${prefix}checkmail
• ${prefix}elements
• ${prefix}tts
• ${prefix}emojimix
• ${prefix}shorten
• ${prefix}save`,

    "5": `
🔽 GROUP MENU 🔽
• ${prefix}groupinfo
• ${prefix}hidetag
• ${prefix}tagall
• ${prefix}setdesc
• ${prefix}open
• ${prefix}close
• ${prefix}add
• ${prefix}kick
• ${prefix}antilink on/off
• ${prefix}antibot on/off
• ${prefix}grouplink
• ${prefix}invite
• ${prefix}promote
• ${prefix}poll
• ${prefix}vcf`,

    "6": `
🔽 SEARCH MENU 🔽
• ${prefix}play
• ${prefix}yts
• ${prefix}imdb
• ${prefix}google
• ${prefix}pinterest
• ${prefix}wallpaper
• ${prefix}wikimedia
• ${prefix}lyrics
• ${prefix}bible
• ${prefix}biblebooks`,

    "7": `
🔽 MAIN MENU 🔽
• ${prefix}ping
• ${prefix}alive
• ${prefix}owner
• ${prefix}menu
• ${prefix}about
• ${prefix}repo`,

    "8": `
🔽 OWNER MENU 🔽
• ${prefix}join
• ${prefix}leave
• ${prefix}block
• ${prefix}unblock
• ${prefix}setppbot
• ${prefix}pp
• ${prefix}anticall
• ${prefix}alwaysonline
• ${prefix}autoread
• ${prefix}autotyping
• ${prefix}autorecording
• ${prefix}autoreact
• ${prefix}autobio
• ${prefix}view
• ${prefix}del
• ${prefix}antidelete on/off`,

    "9": `
🔽 STALK MENU 🔽
• ${prefix}truecaller
• ${prefix}instastalk
• ${prefix}githubstalk`,

    "10": `
🔽 LOGO MENU 🔽
• ${prefix}logo
• ${prefix}hacker
• ${prefix}blackpink
• ${prefix}glossysilver
• ${prefix}naruto
• ${prefix}digitalglitch
• ${prefix}pixelglitch
• ${prefix}star
• ${prefix}smoke
• ${prefix}bear
• ${prefix}neondevil
• ${prefix}screen
• ${prefix}nature
• ${prefix}dragonball
• ${prefix}frozenchristmas
• ${prefix}foilballoon
• ${prefix}colorfulpaint
• ${prefix}americanflag
• ${prefix}water
• ${prefix}underwater
• ${prefix}dragonfire
• ${prefix}bokeh
• ${prefix}snow
• ${prefix}sand3D
• ${prefix}pubg
• ${prefix}horror
• ${prefix}blood
• ${prefix}bulb
• ${prefix}graffiti
• ${prefix}thunder
• ${prefix}thunder1
• ${prefix}womensday
• ${prefix}valentine
• ${prefix}graffiti2
• ${prefix}queencard
• ${prefix}galaxy
• ${prefix}pentakill
• ${prefix}birthdayflower
• ${prefix}zodiac
• ${prefix}water3D
• ${prefix}textlight
• ${prefix}wall
• ${prefix}gold
• ${prefix}glow`
  };

  if (menus[cmd]) {
    await Matrix.sendMessage(m.from, {
      text: menus[cmd],
      contextInfo: { 
        mentionedJid: [m.sender],
        forwardingScore: 999,
        isForwarded: true
      }
    }, { quoted: m });
  }
};

module.exports = menu;
