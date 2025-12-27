const currencyConvert = async (m, sock) => {
  const triggers = ['convert', 'exchange'];
  const match = triggers.find(trigger => m.body?.toLowerCase().startsWith(trigger));

  if (match) {
    const args = m.body.slice(match.length).trim().split(' ');
    if (args.length < 4) return sock.sendMessage(m.from, { text: '💱 Example: convert 100 USD to EUR' }, { quoted: m });

    try {
      const [amount, from, , to] = args;
      const rate = await getExchangeRate(from.toUpperCase(), to.toUpperCase());
      const result = (parseFloat(amount) * rate).toFixed(2);
      
      await sock.sendMessage(m.from, {
        text: `💹 ${amount} ${from.toUpperCase()} = ${result} ${to.toUpperCase()}`
      }, { quoted: m });
    } catch {
      await sock.sendMessage(m.from, { text: '❌ Invalid currency code!' }, { quoted: m });
    }
  }
};
export default currencyConvert;
