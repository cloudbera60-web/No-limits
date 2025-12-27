import baileys from '@whiskeysockets/baileys';
const { WAMessage, WASocket } = baileys;

export default class GroupManager {
    constructor() {
        this.groupSettings = new Map(); // { antiLink: bool, welcomeMsg: string }
        this.metadataCache = new Map();
        this.triggerWords = new Map(); // { groupJid: [{word: string, response: string}]}
    }

    async handleCommand(sock, m, { isAdmin, isBotAdmin, prefix }) {
        if (!m.isGroup || !isAdmin) return;

        const [cmd, ...args] = m.body.slice(prefix.length).split(' ');
        const content = args.join(' ').trim();

        try {
            // Member Management
            if (cmd === 'add') {
                if (!isBotAdmin) throw new Error('Bot needs admin rights');
                await this._addMember(sock, m.from, content);
            }
            else if (cmd === 'kick') {
                await this._removeMember(sock, m.from, content);
            }
            else if (cmd === 'promote') {
                await this._changeAdmin(sock, m.from, content, 'promote');
            }
            else if (cmd === 'demote') {
                await this._changeAdmin(sock, m.from, content, 'demote');
            }

            // Group Settings
            else if (cmd === 'open') {
                await this._setGroupLock(sock, m.from, false);
            }
            else if (cmd === 'close') {
                await this._setGroupLock(sock, m.from, true);
            }
            else if (cmd === 'setdesc') {
                await this._setDescription(sock, m.from, content);
            }
            else if (cmd === 'setname') {
                await this._setGroupName(sock, m.from, content);
            }
            else if (cmd === 'antilink') {
                await this._toggleSetting(sock, m.from, 'antiLink');
            }
            else if (cmd === 'antidelete') {
                await this._toggleSetting(sock, m.from, 'antiDelete');
            }

            // Utilities
            else if (cmd === 'listadmins') {
                await this._listAdmins(sock, m.from);
            }
            else if (cmd === 'listmembers') {
                await this._listMembers(sock, m.from);
            }
            else if (cmd === 'tagall') {
                await this._mentionAll(sock, m.from);
            }
            else if (cmd === 'setwelcome') {
                await this._setWelcomeMessage(sock, m.from, content);
            }
            else if (cmd === 'settrigger') {
                await this._setTriggerWord(sock, m.from, args[0], args.slice(1).join(' '));
            }
            else {
                throw new Error('Unknown command');
            }

        } catch (error) {
            await sock.sendMessage(m.from, { text: `❌ Error: ${error.message}` });
        }
    }

    async checkTriggers(sock, m) {
        if (!this.triggerWords.has(m.from)) return false;
        
        const triggers = this.triggerWords.get(m.from);
        const trigger = triggers.find(t => 
            m.body.toLowerCase().includes(t.word.toLowerCase())
        );

        if (trigger) {
            await sock.sendMessage(m.from, {
                text: trigger.response.replace('@user', `@${m.sender.split('@')[0]}`),
                mentions: [m.sender]
            });
            return true;
        }
        return false;
    }

    async handleMessages(sock, m) {
        if (!m.isGroup) return;
        const settings = this.groupSettings.get(m.from) || {};

        // Anti-link protection
        if (settings.antiLink && /https?:\/\/[^\s]+/.test(m.body)) {
            await sock.sendMessage(m.from, { delete: m.key });
            await sock.sendMessage(m.from, {
                text: `⚠️ @${m.sender.split('@')[0]} Links are not allowed!`,
                mentions: [m.sender]
            });
        }

        // Welcome new members
        if (m.message?.protocolMessage?.type === 2 && settings.welcomeMsg) {
            const newMembers = m.message.protocolMessage.groupParticipantAdd?.participants || [];
            await sock.sendMessage(m.from, {
                text: `👋 ${newMembers.map(m => `@${m.split('@')[0]}`).join(' ')}\n${settings.welcomeMsg}`,
                mentions: newMembers
            });
        }
    }

    // ============= PRIVATE METHODS =============
    async _addMember(sock, groupJid, phone) {
        const userJid = `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
        await sock.groupParticipantsUpdate(groupJid, [userJid], 'add');
        await sock.sendMessage(groupJid, { text: `✅ Added ${phone}` });
    }

    async _removeMember(sock, groupJid, phone) {
        const userJid = `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
        await sock.groupParticipantsUpdate(groupJid, [userJid], 'remove');
        await sock.sendMessage(groupJid, { text: `🚪 Kicked ${phone}` });
    }

    async _changeAdmin(sock, groupJid, phone, action) {
        const userJid = `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
        await sock.groupParticipantsUpdate(groupJid, [userJid], action);
        await sock.sendMessage(groupJid, {
            text: `👑 ${action === 'promote' ? 'Promoted' : 'Demoted'} ${phone}`
        });
    }

    async _setGroupLock(sock, groupJid, locked) {
        await sock.groupSettingUpdate(groupJid, locked ? 'announcement' : 'not_announcement');
        await sock.sendMessage(groupJid, { text: `🔒 Group ${locked ? 'locked' : 'unlocked'}` });
    }

    async _setDescription(sock, groupJid, text) {
        await sock.groupUpdateDescription(groupJid, text);
        await sock.sendMessage(groupJid, { text: '📝 Description updated' });
    }

    async _setGroupName(sock, groupJid, name) {
        await sock.groupUpdateSubject(groupJid, name);
        await sock.sendMessage(groupJid, { text: `🏷️ Group renamed to "${name}"` });
    }

    async _toggleSetting(sock, groupJid, setting) {
        const settings = this.groupSettings.get(groupJid) || {};
        settings[setting] = !settings[setting];
        this.groupSettings.set(groupJid, settings);
        await sock.sendMessage(groupJid, {
            text: `⚙️ ${setting.replace('anti', '').toUpperCase()} ${settings[setting] ? 'ON' : 'OFF'}`
        });
    }

    async _listAdmins(sock, groupJid) {
        const metadata = await this._getGroupMetadata(sock, groupJid);
        const admins = metadata.participants.filter(p => p.admin).map(p => p.id.split('@')[0]);
        await sock.sendMessage(groupJid, {
            text: `👑 Admins:\n${admins.map(a => `• ${a}`).join('\n')}`
        });
    }

    async _listMembers(sock, groupJid) {
        const metadata = await this._getGroupMetadata(sock, groupJid);
        const members = metadata.participants.map(p => p.id.split('@')[0]);
        await sock.sendMessage(groupJid, {
            text: `👥 Members (${members.length}):\n${members.map(m => `• ${m}`).join('\n')}`
        });
    }

    async _mentionAll(sock, groupJid) {
        const metadata = await this._getGroupMetadata(sock, groupJid);
        await sock.sendMessage(groupJid, {
            text: '📢 @everyone',
            mentions: metadata.participants.map(p => p.id)
        });
    }

    async _setWelcomeMessage(sock, groupJid, text) {
        const settings = this.groupSettings.get(groupJid) || {};
        settings.welcomeMsg = text;
        this.groupSettings.set(groupJid, settings);
        await sock.sendMessage(groupJid, { text: '🎉 Welcome message set!' });
    }

    async _setTriggerWord(sock, groupJid, word, response) {
        if (!word || !response) throw new Error('Usage: /settrigger [word] [response]');
        const triggers = this.triggerWords.get(groupJid) || [];
        triggers.push({ word: word.toLowerCase(), response });
        this.triggerWords.set(groupJid, triggers);
        await sock.sendMessage(groupJid, {
            text: `🔔 New trigger: When someone says "${word}", I'll respond with:\n"${response}"`
        });
    }

    async _getGroupMetadata(sock, groupJid) {
        if (!this.metadataCache.has(groupJid)) {
            this.metadataCache.set(groupJid, await sock.groupMetadata(groupJid));
        }
        return this.metadataCache.get(groupJid);
    }
    }
