const fs = require('fs').promises;
const path = require('path');

class PluginLoader {
    constructor() {
        this.plugins = new Map();
        this.pluginDir = path.join(__dirname, 'plugins');
    }

    async loadPlugins() {
        try {
            // Create plugins directory if it doesn't exist
            await fs.mkdir(this.pluginDir, { recursive: true });
            
            const files = await fs.readdir(this.pluginDir);
            const pluginFiles = files.filter(file => file.endsWith('.js'));
            
            console.log(`📦 Found ${pluginFiles.length} plugin(s)`);
            
            for (const file of pluginFiles) {
                await this.loadPlugin(file);
            }
            
            return this.plugins.size;
        } catch (error) {
            console.error('Error loading plugins:', error);
            return 0;
        }
    }

    async loadPlugin(filename) {
        try {
            const pluginPath = path.join(this.pluginDir, filename);
            const pluginName = path.basename(filename, '.js');
            
            // Clear require cache to allow hot reload
            delete require.cache[require.resolve(pluginPath)];
            
            const pluginModule = require(pluginPath);
            
            if (typeof pluginModule === 'function' || (pluginModule.default && typeof pluginModule.default === 'function')) {
                const pluginFunc = pluginModule.default || pluginModule;
                this.plugins.set(pluginName, pluginFunc);
                console.log(`✅ Loaded plugin: ${pluginName}`);
                return true;
            } else {
                console.log(`⚠️ Plugin ${pluginName} doesn't export a function`);
                return false;
            }
        } catch (error) {
            console.error(`❌ Failed to load plugin ${filename}:`, error.message);
            return false;
        }
    }

    async executePlugin(pluginName, m, sock) {
        try {
            const plugin = this.plugins.get(pluginName);
            if (!plugin) {
                return { success: false, error: `Plugin ${pluginName} not found` };
            }
            
            await plugin(m, sock);
            return { success: true };
        } catch (error) {
            console.error(`Error executing plugin ${pluginName}:`, error);
            return { success: false, error: error.message };
        }
    }

    getPluginCommands() {
        const commands = {};
        for (const [name, plugin] of this.plugins) {
            // You can add metadata to plugins to define their commands
            commands[name] = name;
        }
        return commands;
    }

    async reloadPlugin(filename) {
        const pluginName = path.basename(filename, '.js');
        this.plugins.delete(pluginName);
        return await this.loadPlugin(filename);
    }

    async reloadAllPlugins() {
        this.plugins.clear();
        return await this.loadPlugins();
    }
}

// Singleton instance
const pluginLoader = new PluginLoader();
module.exports = pluginLoader;
