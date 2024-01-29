require('dotenv').config();
const { Bot, InlineKeyboard } = require('grammy');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { DateTime } = require('luxon');
const cron = require('node-cron');
const axios = require('axios');
const qs = require('qs');
const https = require('https');
require('dotenv').config();


const bot = new Bot(process.env.BOT_API_KEY);

// Инициализация и открытие базы данных
let db;
async function initializeDatabase() {
    db = await open({
        filename: 'shifts.db',
        driver: sqlite3.Database
    });
    await db.run('CREATE TABLE IF NOT EXISTS shift_records (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, chat_id TEXT, start_time TEXT, end_time TEXT, sent_messages INTEGER DEFAULT 0, awake_responses INTEGER DEFAULT 0, shift_date TEXT)');
}
initializeDatabase().catch(console.error);


// Вспомогательные функции
function isNightTimeInMoscow() {
    const moscowTime = DateTime.now().setZone('Europe/Moscow');
    return moscowTime.hour >= 21 && moscowTime.hour < 24;
}


function getMoscowTimestamp() {
    return DateTime.now().setZone('Europe/Moscow').toFormat('yyyy-MM-dd HH:mm:ss');
}

let shiftActive = false;
let shiftUser = null;
let shiftInterval = null;
let shiftMessages = [];
let shiftStartTime;
let shiftEndTime;


const usernameMappings = {
    "lipchinski": "Дмитрий Селиванов",
    "YurkovOfficial": "Пётр Юрков",
    "Jlufi": "Даниил Маслов",
    "EuroKaufman": "Даниил Баратов",
    "gluteusmx": "Тимофей Курилин"
};

// Функция для получения токена
async function getAuthToken() {
    const data = qs.stringify({ 'scope': 'GIGACHAT_API_PERS' });
    const agent = new https.Agent({
        rejectUnauthorized: false
    });
    const config = {
        method: 'post',
        url: 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
        headers: {
            'RqUID': '6f0b1291-c7f3-43c6-bb2e-9f3efb2dc98e',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${process.env.GIGACHAT_API_KEY}`
        },
        data: data,
        httpsAgent: agent
    };

    try {
        const response = await axios.request(config);
        return response.data.access_token;
    } catch (error) {
        console.error(error);
        return null;
    }
}

// Функция для получения случайного факта с использованием токена
async function fetchRandomFactWithToken(token) {
    const agent = new https.Agent({
        rejectUnauthorized: false
    });
    const requestData = {
        "model": "GigaChat:latest",
        "temperature": 1.97,
        "n": 1,
        "max_tokens": 512,
        "repetition_penalty": 1.07,
        "stream": false,
        "update_interval": 0,
        "messages": [
            {
                "role": "system",
                "content": "Отвечай как учитель JavaScript"
            },
            {
                "role": "user",
                "content": "Напиши разбор небольшой задачи на JavaScript"
            }
        ]
    };

    const config = {
        method: 'post',
        url: 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        data: JSON.stringify(requestData),
        httpsAgent: agent
    };

    try {
        const response = await axios.request(config);
        if (response.data && response.data.choices && response.data.choices.length > 0) {
            const messageContent = response.data.choices[0].message.content;
            return messageContent;
        } else {
            console.log("Нет данных для отображения.");
            return null;
        }
    } catch (error) {
        console.error(error);
        return null;
    }
}

// Функция для обновления токена и выполнения действий
async function updateTokenAndPerformActions() {
    try {
        const token = await getAuthToken();
        if (token) {
            const newFact = await fetchRandomFactWithToken(token);
            if (newFact) {
                addJsFact(newFact);
            }
            console.log("Факты и токен обновлены.");
        } else {
            console.log("Не удалось получить токен.");
        }
    } catch (error) {
        console.error("Ошибка во время обновления токена и выполнения действий:", error);
    }
}


const jsFacts = [];

function addJsFact(newFact) {
    if (jsFacts.length >= 5) {
        jsFacts.shift(); // Удаляем самый старый факт, если в массиве уже 5 фактов
    }
    jsFacts.push(newFact); // Добавляем новый факт
    console.log('Новый факт добавлен:', newFact);
}


function getLastJsFact() {
    if (jsFacts.length === 0) {
        return null; // Возвращаем null, если массив пуст
    }
    return jsFacts[jsFacts.length - 1]; // Возвращаем последний факт из массива
}


async function sendShiftMessages(ctx, testMode = false) {
    if (!shiftActive && !testMode) return;

    const moscowTime = DateTime.now().setZone('Europe/Moscow');
    if (!testMode && moscowTime >= DateTime.fromISO(shiftEndTime)) {
        await endShift();
        return;
    }

    const chatId = await getChatIdForUser(shiftUser);
    if (!chatId) return;

    try {
        await updateTokenAndPerformActions();

        const token = await getAuthToken();
        if (!token) {
            console.log("Не удалось получить токен.");
            return;
        }

        const fact = getLastJsFact() || "Интересный факт о JavaScript"; // Запасной вариант факта, если основной не доступен

        const sentMessage = await bot.api.sendMessage(chatId, `${fact}\n\nСпишь? Проверь Grafana и каналы с алертами...`, {
            reply_markup: new InlineKeyboard().text('Не сплю', 'awake')
        });

        trackSentMessage(sentMessage);
    } catch (error) {
        console.error("Ошибка при отправке сообщения:", error);
    }
}

async function endShift() {
    shiftActive = false;
    const chatId = await getChatIdForUser(shiftUser);
    if (chatId) {
        await bot.api.sendMessage(chatId, 'Смена завершена.');
    }
}

async function getChatIdForUser(username) {
    if (!username) return null;
    const record = await db.get('SELECT chat_id FROM shift_records WHERE username = ? ORDER BY id DESC LIMIT 1', [username]);
    return record ? record.chat_id : null;
}

function trackSentMessage(sentMessage) {
    shiftMessages.push({
        messageId: sentMessage.message_id,
        timestamp: Date.now()
    });

    db.run('UPDATE shift_records SET sent_messages = sent_messages + 1 WHERE username = ? AND shift_date = ?', [shiftUser, DateTime.now().toFormat('yyyy-MM-dd')]).catch(console.error);

    setTimeout(() => {
        if (shiftMessages.some(msg => msg.messageId === sentMessage.message_id)) {
            bot.api.deleteMessage(sentMessage.chat.id, sentMessage.message_id).catch(console.error);
            shiftMessages = shiftMessages.filter(msg => msg.messageId !== sentMessage.message_id);
        }
    }, 600000); // 10 минут
}



function startShiftMessageInterval(ctx, testMode = false) {
    console.log("startShiftMessageInterval called, testMode:", testMode); // Логгирование

    if (testMode) {
        // Тестовый режим: отправка сообщения каждые 30 секунд
        function scheduleTestMessage() {
            console.log("Отправка тестового сообщения в:", new Date().toISOString()); // Логгирование
            sendShiftMessages(ctx, testMode);
            setTimeout(scheduleTestMessage, 30000); // Повтор через 30 секунд
        }
        scheduleTestMessage();
    } else {
        // Обычный режим: отправка сообщения в случайное время в течение 20-минутного интервала
        function scheduleRegularMessage() {
            const now = new Date();
            const minutesPastHour = now.getMinutes();
            const delayToNextIntervalStart = ((Math.floor(minutesPastHour / 20) + 1) * 20 - minutesPastHour) * 60000;
            const randomDelayInsideInterval = Math.floor(Math.random() * 20) * 60000; // Случайная задержка до 20 минут
            const totalDelay = delayToNextIntervalStart + randomDelayInsideInterval;

            const scheduledTime = new Date(now.getTime() + totalDelay);
            console.log("Отправка обычного сообщения запланирована на:", scheduledTime.toISOString()); // Логгирование
            setTimeout(() => {
                sendShiftMessages(ctx, testMode);
                scheduleRegularMessage(); // Планирование следующего сообщения
            }, totalDelay);
        }
        scheduleRegularMessage();
    }
}


bot.command('start', ctx => ctx.reply('С помощью этого бота можно выходить на ночные смены'));


let confirmationMessageId;

bot.command('shift', async ctx => {
    // Проверка времени в Москве
    const moscowCurrentTime = DateTime.now().setZone('Europe/Moscow');
    if (!isNightTimeInMoscow()) {
        await ctx.reply('Команда /shift доступна только в диапазоне 21:00-23:00 по Москве.');
        return;
    }

    // Получение username пользователя
    const username = ctx.from.username;
    if (!(username in usernameMappings)) {
        await ctx.reply('У вас нет доступа к этой команде.');
        return;
    }

    // Установка времени начала и окончания смены
    shiftStartTime = moscowCurrentTime.set({ hour: 21, minute: 0, second: 0 }).toISO();
    shiftEndTime = moscowCurrentTime.plus({ days: 1 }).set({ hour: 9, minute: 0, second: 0 }).toISO();

    // Проверка наличия активной смены
    try {
        const activeShift = await db.get('SELECT * FROM shift_records WHERE end_time > ?', [moscowCurrentTime.toFormat('yyyy-MM-dd HH:mm:ss')]);
        if (activeShift) {
            await ctx.reply(`Уже есть активная смена, активированная пользователем ${activeShift.username}. Новую смену нельзя активировать.`);
            return;
        }
    } catch (error) {
        console.error('Ошибка при проверке активной смены:', error);
        await ctx.reply('Произошла ошибка при проверке активной смены.');
        return;
    }

    // Создание клавиатуры для подтверждения смены
    const inlineKeyboard = new InlineKeyboard()
        .text('Да', 'confirm_shift')
        .text('Нет', 'cancel_shift');

    // Отправка сообщения с подтверждением смены и сохранение messageId
    const confirmationMessage = await ctx.reply('Вы подтверждаете выход на ночную смену?', {
        reply_markup: inlineKeyboard
    });

    confirmationMessageId = confirmationMessage.message_id; // Присвоение messageId переменной
});




bot.callbackQuery('confirm_shift', async ctx => {
    shiftActive = true;
    shiftUser = ctx.from.username;
    startShiftMessageInterval(ctx);

    await ctx.answerCallbackQuery('Вы вышли на ночную смену.');
    await ctx.api.deleteMessage(ctx.chat.id, confirmationMessageId);

    // Получаем timestamp для 9 утра следующего дня
    const endTimestamp = DateTime.now().setZone('Europe/Moscow').plus({ days: 1 }).startOf('day').set({ hour: 9 }).toFormat('yyyy-MM-dd HH:mm:ss');

    // Получаем идентификатор чата
    const chatId = ctx.chat.id;

    // Вставляем запись о смене в базу данных
    await db.run('INSERT INTO shift_records (username, chat_id, start_time, end_time, awake_responses, shift_date) VALUES (?, ?, ?, ?, ?, ?)', [ctx.from.username, chatId, getMoscowTimestamp(), endTimestamp, 0, DateTime.now().toFormat('yyyy-MM-dd')]);
});



bot.callbackQuery('cancel_shift', async ctx => {
    shiftActive = false;
    shiftUser = null;
    clearInterval(shiftInterval);

    await ctx.answerCallbackQuery('Вы отменили начало ночной смены.');
    await ctx.api.deleteMessage(ctx.chat.id, confirmationMessageId);

});


bot.callbackQuery('awake', async ctx => {
    // Получение ID сообщения, на которое был дан ответ
    const messageId = ctx.update.callback_query.message.message_id;

    // Проверка, есть ли это сообщение в списке отслеживаемых
    const messageIndex = shiftMessages.findIndex(msg => msg.messageId === messageId);
    if (messageIndex !== -1) {
        // Удаление сообщения из списка отслеживаемых
        shiftMessages.splice(messageIndex, 1);

        // Регистрация отклика пользователя в базе данных
        await db.run('UPDATE shift_records SET awake_responses = awake_responses + 1 WHERE username = ? AND shift_date = ?', [ctx.from.username, DateTime.now().toFormat('yyyy-MM-dd')]);

        // Уведомление пользователя о зарегистрированном отклике
        await ctx.answerCallbackQuery('Отлично, вы бодрствуете!');

        // Попытка удалить сообщение после задержки
        setTimeout(async () => {
            try {
                await ctx.deleteMessage();
            } catch (error) {
                console.error('Ошибка при удалении сообщения: ', error);
            }
        }, 3000); // Задержка в 10 секунд
    }
});



bot.command('test_shift', async ctx => {
    const username = ctx.from.username;
    if (!(username in usernameMappings)) {
        await ctx.reply('У вас нет доступа к этой тестовой команде.');
        return;
    }

    // Проверяем, не активна ли уже смена
    if (shiftActive) {
        await ctx.reply('Смена уже активирована.');
        return;
    }

    // Активируем тестовую смену
    shiftActive = true;
    shiftUser = username;
    shiftInterval = startShiftMessageInterval(ctx, true); // true для активации тестового режима

    await ctx.reply('Тестовая смена активирована. Начинаем отправку тестовых сообщений.');
});

async function checkActiveShiftOnStartup() {
    try {
        const moscowTime = DateTime.now().setZone('Europe/Moscow').toFormat('yyyy-MM-dd HH:mm:ss');
        const activeShift = await db.get('SELECT * FROM shift_records WHERE end_time > ?', [moscowTime]);

        if (activeShift) {
            shiftActive = true;
            shiftUser = activeShift.username;
            startShiftMessageInterval(null, false); // null в качестве ctx, поскольку он не доступен
            console.log(`Активная смена найдена. Пользователь: ${activeShift.username}`);
        } else {
            console.log("Активная смена не найдена.");
        }
    } catch (error) {
        console.error('Ошибка при проверке активной смены при старте:', error);
    }
}

// При инициализации бота
initializeDatabase().then(() => {
    checkActiveShiftOnStartup();
    bot.start();
}).catch(console.error);
