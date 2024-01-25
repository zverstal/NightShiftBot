# NightShiftBotJS

## Обзор
NightShiftBotJS - бот ночных смен с Gigachat API

## Начало работы

### Предварительные требования
- `git`
- `Node.js` (версия 21.x)
- `npm`
- Telegram Bot API ключ
- Gigachat 

### Установка и настройка

1. **Обновление системы**
   ```bash
   sudo apt-get update && sudo apt-get upgrade -y
2. **Установка Git**
   ```bash
   sudo apt install git
3. **Клонирование репозитория**
   ```bash
   git clone https://github.com/zverstal/NightShiftBot
4. **Установка необходимых инструментов**
   ```bash
    sudo apt-get install -y ca-certificates curl gnupg
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

    NODE_MAJOR=21
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list


5. **Установка NodeJS**
   ```bash
   sudo apt-get update
   sudo apt-get install nodejs -y

6. **Установка зависимостей**
   ```bash
   cd NightShiftBot
   npm i

7. **Переменные окружения**
   ```bash
   touch .env
   sudo nano .env
   BOT_API_KEY='API_ключ_бота'
   GIGACHAT_API_KEY='Авторизационные данные от гигачата'

8. **Установка PM2**
    ```bash
    sudo npm i pm2 -g

9. **Установка sqlite3**
    ```bash
    sudo install sqlite3    

10. **Старт проекта**
   ```bash
   pm2 start index.js