import { generateWAMessageFromContent, proto } from '@whiskeysockets/baileys';

const profileInfo = async (m, sock) => {
  const text = m.body?.trim();
  const triggers = ['getpp', 'prop', 'profilepic']; // Trigger words
  const match = triggers.find(trigger => text.toLowerCase().startsWith(trigger));

  if (match) {
    let user;
    
    // If it's a group and someone is mentioned, fetch their profile
    if (m.isGroup && m.mentionedJid && m.mentionedJid.length > 0) {
      user = m.mentionedJid[0];
    } else {
      // Else default to the sender (private chat or no mention)
      user = m.sender;
    }

    try {
      // Fetch profile picture
      let pp = await sock.profilePictureUrl(user, 'image').catch(() => null);

      // Fetch display name
      let name = await sock.getName(user);

      // Fetch status/bio
      let about = await sock.fetchStatus(user).then(res => res.status).catch(() => 'No bio found.');

      let caption = `👤 *Profile Info*\n\n🔖 *Name:* ${name}\n🆔 *JID:* ${user}\n🗒️ *Bio:* ${about}`;

      if (pp) {
        await sock.sendMessage(
          m.from,
          { 
            image: { url: prop },
            caption: caption,
            mentions: [user]
          },
          { quoted: m }
        );
      } else {
        await sock.sendMessage(
          m.from,
          { text: `${caption}\n\n⚠️ Profile picture not available.` },
          { quoted: m }
        );
      }
    } catch (err) {
      console.error(err);
      await sock.sendMessage(
        m.from,
        { text: '❌ Could not fetch the profile info. They may not have a profile photo or you may not have permission.' },
        { quoted: m }
      );
    }
  }
};

export default profileInfo;
