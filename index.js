const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const youtubedl = require('youtube-dl-exec');
const fs = require('fs');
const path = require('path');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const { google } = require('googleapis');
require('dotenv').config();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

//  RU: Папка с вашим ботом должна быть названа одним словом, иначе при попытке воспроизведения файла будет возникать ошибка.
//  EN: The folder with your bot must be named with a single word; otherwise, an error will occur when trying to play the file.

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);

client.once('ready', async () => {
    console.log('Бот запущен и готов к работе!');

    const commands = [
        new SlashCommandBuilder()
            .setName('play')
            .setDescription('Ищет и воспроизводит песню по URL или названию')
            .addStringOption(option =>
                option.setName('query')
                    .setDescription('URL или название песни')
                    .setRequired(true)),
    ];

    try {
        console.log('Начинается перезапись команд (/) для гильдии.');

        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );

        console.log('Команды успешно перезаписаны.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'play') {
        const query = interaction.options.getString('query');
        const isUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/.test(query);

        if (isUrl) {
            await interaction.reply(`Воспроизвожу музыку по URL: ${query}`);
            await downloadAndPlay(query, interaction);
        } else {
            const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });
            try {
                const response = await youtube.search.list({
                    part: 'snippet',
                    maxResults: 1,
                    q: query,
                    type: 'video',
                });

                if (response.data.items.length > 0) {
                    const video = response.data.items[0];
                    const videoTitle = video.snippet.title;
                    const videoUrl = `https://www.youtube.com/watch?v=${video.id.videoId}`;
                    await interaction.reply(`Нашёл видео: **${videoTitle}**. Воспроизвожу...`);
                    await downloadAndPlay(videoUrl, interaction);
                } else {
                    await interaction.reply('Видео не найдено по данному запросу.');
                }
            } catch (error) {
                console.error('Ошибка при поиске видео:', error);
                await interaction.reply('Произошла ошибка при поиске видео.');
            }
        }
    }
});

async function downloadAndPlay(url, interaction) {
    const outputFilePath = path.resolve(__dirname, 'downloads', `song-${Date.now()}.mp3`);

    try {
        if (!fs.existsSync(path.join(__dirname, 'downloads'))) {
            fs.mkdirSync(path.join(__dirname, 'downloads'));
            console.log('Папка для загрузок создана');
        }

        await youtubedl(url, {
            extractAudio: true,
            audioFormat: 'mp3',
            output: outputFilePath,
            noWarnings: true,
            'playlist-items': '1',
        });

        console.log('Музыка успешно скачана!');

        const member = await interaction.guild.members.fetch(interaction.user.id);
        const voiceChannel = member.voice.channel;

        if (voiceChannel) {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            const player = createAudioPlayer();
            const resource = createAudioResource(outputFilePath);

            player.play(resource);
            connection.subscribe(player);

            player.on(AudioPlayerStatus.Idle, () => {
                console.log('Воспроизведение завершено');
                if (fs.existsSync(outputFilePath)) {
                    fs.unlinkSync(outputFilePath);
                    console.log('Файл удален после воспроизведения');
                }
                connection.destroy();
            });

            player.on('error', (error) => {
                console.error('Ошибка воспроизведения:', error);
                if (fs.existsSync(outputFilePath)) {
                    fs.unlinkSync(outputFilePath);
                    console.log('Файл удален из-за ошибки воспроизведения');
                }
                connection.destroy();
            });

            connection.on(VoiceConnectionStatus.Disconnected, () => {
                console.log('Бот отключился от голосового канала');
            });
        } else {
            interaction.reply('Вы должны быть в голосовом канале, чтобы воспроизвести музыку!');
        }
    } catch (error) {
        console.error('Ошибка при скачивании музыки:', error);
        interaction.reply('Произошла ошибка при скачивании музыки. Проверьте, правильный ли URL.');
    }
}


client.login(DISCORD_BOT_TOKEN);
