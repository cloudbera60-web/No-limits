import config from '../config.cjs';

let recordingTimeout;

const startRecording = async (Matrix, chatId) => {
  try {
    await Matrix.sendPresenceUpdate('recording', chatId);
    recordingTimeout = setTimeout(() => {
      Matrix.sendPresenceUpdate('paused', chatId);
    }, 10000); // 10 seconds
  } catch (error) {
    console.error('Recording error:', error);
  }
};

const autorecordingCommand = async (m, Matrix) => {
  const allowedUsers = [
    await Matrix.decodeJid(Matrix.user.id), // Bot
    config.OWNER_NUMBER + '@s.whatsapp.net' // Owner
  ];

  if (!m.body.toLowerCase().startsWith('autorecording')) return;
  if (!allowedUsers.includes(m.sender)) return;

  const command = m.body.toLowerCase().split(' ')[1];

  if (command === 'on') {
    config.AUTO_RECORDING = true;
    await m.reply("🎙️ Auto-Recording ACTIVE");
  } 
  else if (command === 'off') {
    config.AUTO_RECORDING = false;
    clearTimeout(recordingTimeout);
    await m.reply("🚫 Auto-Recording INACTIVE");
  }
};

// Trigger on messages
export const handleIncoming = async (m, Matrix) => {
  if (config.AUTO_RECORDING && !recordingTimeout) {
    startRecording(Matrix, m.from);
  }
};

export default autorecordingCommand;
