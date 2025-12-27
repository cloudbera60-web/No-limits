import config from '../../config.cjs';

// For tracking auto-bio interval
const intervals = {}; 

const startTime = Date.now(); // Store bot start time

// Juice WRLD quotes collection
const juiceWRLDQuotes = [
    "Sometimes the pain is all we know, it's home",
    "Life's a puzzle, you'll find your pieces",
    "I'd rather be lonely than unhappy",
    "The devil don't mean maybe, he's always sure",
    "Legends never die, they live forever",
    "What's the 27 Club? We ain't making it past 21",
    "I'm still fighting my demons, I'm still losing",
    "I don't wanna hurt no more",
    "Life's unreal when you're living a dream",
    "pain is a sigh of progress ",
    "I'm a rockstar by blood, I don't need a stage",
    "Sometimes I feel like I'm better off dead",
    "I'm too high to die, I'm too low to fly",
    "Love is war, but I'm fighting for peace",
    "I'm just tryna find my way through all this pain"
];

// Function to get real-time formatted date (Nairobi Time Zone)
const getRealDate = () => {
    const now = new Date();
    return now.toLocaleDateString('en-GB', {
        timeZone: 'Africa/Nairobi',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
};

// Function to get real-time formatted time (Nairobi Time Zone)
const getRealTime = () => {
    const now = new Date();
    return now.toLocaleTimeString('en-GB', {
        timeZone: 'Africa/Nairobi',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

// Function to calculate uptime accurately
const getUptime = () => {
    const totalSeconds = Math.floor((Date.now() - startTime) / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
};

// Function to get random Juice WRLD quote
const getRandomQuote = () => {
    const randomIndex = Math.floor(Math.random() * juiceWRLDQuotes.length);
    return juiceWRLDQuotes[randomIndex];
};

// Function to update Bio with real-time date, time, uptime, and quote
const updateBio = async (Matrix) => {
    const currentDate = getRealDate();
    const currentTime = getRealTime();
    const uptime = getUptime();
    const quote = getRandomQuote();

    const newBio = `CLOUD AI Active | ${currentDate} | ${currentTime} | Uptime: ${uptime} | Juice: ${quote}`;

    try {
        await Matrix.updateProfileStatus(newBio);
        console.log("Bio updated successfully:", newBio);
    } catch (error) {
        console.error("Failed to update bio:", error);
    }
};

// Command function to enable/disable Auto Bio
const autobioCommand = async (m, Matrix) => {
    if (config.AUTO_BIO) {
        if (!intervals['autobio']) {
            intervals['autobio'] = setInterval(() => updateBio(Matrix), 60000); // Update every 1 min
            console.log("Auto-Bio updates enabled.");
        }
    } else {
        if (intervals['autobio']) {
            clearInterval(intervals['autobio']);
            delete intervals['autobio'];
            console.log("Auto-Bio updates disabled.");
        }
    }
};

export default autobioCommand;
