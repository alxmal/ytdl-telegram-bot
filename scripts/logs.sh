#!/bin/bash

# Просмотр логов в реальном времени
docker-compose logs -f telegram-bot

# Или с фильтрацией по уровню
# docker-compose logs -f telegram-bot | grep -E "(ERROR|WARN|INFO)"

# Просмотр только ошибок
# docker-compose logs telegram-bot | grep ERROR
