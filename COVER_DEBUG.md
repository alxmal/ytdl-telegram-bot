# Диагностика /cover команды

## Ошибка: "Failed to get audio duration"

### Возможные причины:

1. **FFprobe не установлен**
   ```bash
   # Проверить внутри контейнера
   docker exec gimmevideo-telegram-bot-1 ffprobe -version
   ```

2. **Файл не скачался или повреждён**
   - Проверьте логи с уровнем DEBUG
   - Должны быть записи: `Downloading audio file`, `Audio file downloaded`

3. **Нет прав на /tmp**
   ```bash
   docker exec gimmevideo-telegram-bot-1 ls -la /tmp
   ```

### Улучшенное логирование (добавлено):

#### При скачивании аудио:
```
debug: Downloading audio file | userId=... fileId=... filePath=... audioPath=/tmp/audio_...
debug: Audio file downloaded | userId=... audioPath=/tmp/audio_... fileSize=12345
```

#### При определении длительности:
```
debug: Getting audio duration | audioPath=/tmp/audio_...
debug: Audio duration retrieved | audioPath=/tmp/audio_... duration=180
```

#### При ошибке FFprobe:
```
error: FFprobe failed | audioPath=/tmp/audio_... exitCode=1 stderr="..." stdout="..."
error: FFprobe spawn error | audioPath=/tmp/audio_... error="..."
```

### Как включить DEBUG логи:

1. **В docker-compose.yml:**
   ```yaml
   environment:
     LOG_LEVEL: "debug"
   ```

2. **Перезапустить:**
   ```bash
   docker-compose restart telegram-bot
   ```

3. **Смотреть логи:**
   ```bash
   docker logs -f gimmevideo-telegram-bot-1
   ```

### Проверка FFprobe в контейнере:

```bash
# Войти в контейнер
docker exec -it gimmevideo-telegram-bot-1 sh

# Проверить ffprobe
ffprobe -version

# Если нет - установить (alpine)
apk add ffmpeg

# Выйти
exit
```

### Если FFprobe отсутствует в образе:

Обновите `Dockerfile`:
```dockerfile
# deps
RUN apk add --no-cache python3 ffmpeg curl
```

FFmpeg уже включает ffprobe, но убедитесь что он в PATH:
```bash
which ffprobe
# Должно вывести: /usr/bin/ffprobe
```

### Тестирование вручную:

```bash
# В контейнере
cd /tmp

# Скачать тестовый MP3
wget https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3 -O test.mp3

# Проверить ffprobe
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 test.mp3

# Должно вывести длительность в секундах, например: 358.775510
```

### Следующие шаги:

1. Включите `LOG_LEVEL: "debug"`
2. Попробуйте `/cover` снова
3. Проверьте логи - там будет детальная информация
4. Если ffprobe не найден - проверьте Dockerfile

