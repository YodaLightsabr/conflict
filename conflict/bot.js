import Discord, { Client, Intents, Message, MessageEmbed } from 'discord.js'
import { dirname } from "esm-dirname"
import path from 'path'
import fs from 'fs'
import stump from './logger.js'
import { _setClient, onInteractionCreate } from './events.js'
import Command, { InteractionResponse } from './commands.js'
const __dirname = dirname(import.meta);

(async () => {

    let config;
    try {
        config = await import(process.cwd() + '/conflict.config.js');
    } catch (err) {
        return stump.error('Missing conflict.config.js');
    }
    const { token, intents } = config.default;

    const client = new Client({ intents: (intents || ["GUILD_MESSAGES"]).map(intent => Intents.FLAGS[intent] ) });

    _setClient(client);

    client.on('ready', () => {
        stump.success('Logged in as ' + client.user.tag);
        initCommands();
    });

    client.login(token);

    async function initEvents () {
        let eventsPath = path.join(process.cwd(), '.conflict', 'events');
        if (fs.existsSync(eventsPath)) {
            let files = fs.readdirSync(eventsPath);
            let filePaths = files.map(file => path.join(eventsPath, file));
            for (const file of filePaths) {
                if (file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.mjs')) await import(file);
            }
        }    
    }

    let commands = {};

    async function initCommands () {
        let commandsPath = path.join(process.cwd(), '.conflict', 'commands');
        if (fs.existsSync(commandsPath)) {
            let files = fs.readdirSync(commandsPath);
            let filePaths = files.map(file => path.join(commandsPath, file));
            for (const file of filePaths) {
                if (file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.mjs')) {
                    let fileData = await import(file);

                    if (fileData.default && fileData.default instanceof Command) {
                        let command = fileData.default;
                        commands[command.name] = command;
                    }
                }
            }
        }

        let publicCommands = [];
        let guildCommands = {};
        for (const command in commands) {
            let commandData = commands[command];
            if (commandData.testing && commandData.testing.guildId) {
                if (!guildCommands[commandData.testing.guildId]) guildCommands[commandData.testing.guildId] = [];
                guildCommands[commandData.testing.guildId].push({
                    name: commandData.name,
                    description: commandData.description,
                    options: commandData.options
                });
            } else {
                publicCommands.push({
                    name: commandData.name,
                    description: commandData.description,
                    options: commandData.options
                });
            }
        }
        await client.api.applications(client.user.id).commands.put({
            data: publicCommands
        });
        for (const guild in guildCommands) {
            const commandsForGuild = guildCommands[guild];
            await client.api.applications(client.user.id).guilds(guild).commands.put({
                data: commandsForGuild
            });
        }

        onInteractionCreate(async interaction => {
            if (interaction.isCommand()) {
                if (commands[interaction.commandName]) {
                    let command = commands[interaction.commandName];
                    try {
                        let output = await command.execute(new InteractionResponse(interaction));
                        if (output instanceof Promise) output = await output;
                    } catch (err) {
                        console.error(err);
                        try {
                            interaction.reply({ embeds: [
                                new MessageEmbed()
                                    .setColor('#ff4444')
                                    .setTitle('Command Error')
                                    .setDescription('```' + err.stack + '```')
                                    .setTimestamp()
                            ] });
                        } catch (nestedErr) {
                            interaction.channel.send(
                                new MessageEmbed()
                                    .setColor('#ff4444')
                                    .setTitle('Command Error')
                                    .setDescription('```' + err.stack + '```')
                                    .setTimestamp()
                            );
                        }
                    }
                } else {
                    interaction.reply({ embeds: [
                        new MessageEmbed()
                            .setColor('#ff4444')
                            .setTitle('Command Error')
                            .setDescription('```' + `Conflict Erorr: CommandNotFound` + '```')
                            .setTimestamp()
                    ] });
                }
            }
        });
    }

    async function init () {
        await initEvents();
    }

    init();
})();