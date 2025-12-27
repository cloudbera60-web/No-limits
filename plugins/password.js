const passwordGen = async (m, sock) => {
  const triggers = ['password', 'genpw'];
  const match = triggers.find(trigger => m.body?.toLowerCase().startsWith(trigger));

  if (match) {
    const length = parseInt(m.body.slice(match.length).trim()) || 12;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    await sock.sendMessage(m.from, {
      text: `🔐 *Generated Password (${length} chars):*\n\`\`\`${password}\`\`\`\n\n⚠️ Save it securely!`,
      contextInfo: { forwardingScore: 999, isForwarded: true }
    }, { quoted: m });
  }
};
export default passwordGen;
