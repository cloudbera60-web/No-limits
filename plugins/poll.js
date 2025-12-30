const pollCommand = async (m, Matrix) => {
  const prefix = process.env.BOT_PREFIX || '.';
  const cmd = m.body.startsWith(prefix) ? m.body.slice(prefix.length).split(' ')[0].toLowerCase() : '';
  const text = m.body.slice(prefix.length + cmd.length).trim();

  if (cmd !== 'poll') return;

  const args = text.split(' ');
  if (args.length < 2) {
    return m.reply(`Usage: ${prefix}poll "Question" | option1 | option2 | ...\n\nExample: ${prefix}poll "Best programming language?" | JavaScript | Python | Java | C++`);
  }

  // Join args back and split by pipe
  const fullText = args.join(' ');
  if (!fullText.includes('|')) {
    return m.reply(`Please separate question and options with |\n\nExample: ${prefix}poll "Best programming language?" | JavaScript | Python | Java | C++`);
  }

  let [question, ...options] = fullText.split('|').map(item => item.trim());
  
  // Remove quotes from question if present
  question = question.replace(/^["']|["']$/g, '');

  if (options.length < 2) {
    return m.reply('Please provide at least 2 options for the poll.');
  }

  if (options.length > 10) {
    return m.reply('Maximum 10 options allowed for a poll.');
  }

  try {
    await Matrix.sendMessage(m.from, {
      poll: {
        name: question,
        values: options
      }
    }, { quoted: m });
  } catch (error) {
    console.error('Poll creation error:', error);
    await m.reply('❌ Failed to create poll. Please try again.');
  }
};

module.exports = pollCommand;
