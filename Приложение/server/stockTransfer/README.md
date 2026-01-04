# Модуль перемещения остатков Wildberries (Node.js)

> Важно: у Wildberries нет официального API для создания заявок на перемещение остатков.
> Этот модуль использует автоматизацию веб-форм личного кабинета.

## Возможности

- Получение складов продавца через официальное API
- Получение остатков по каждому складу через официальное API
- Расчёт рекомендаций по перераспределению
- Автоматизация формы «Перемещение остатков» в личном кабинете
- Обработка очереди, повторов и ограничений

## Подключение

```bash
npm i playwright node-fetch
```

## Пример использования

```js
import { StocksTransferModule } from './stockTransferModule.js'

const module = new StocksTransferModule({
  wbToken: process.env.WB_TOKEN,
  portalLogin: process.env.WB_LOGIN,
  portalPassword: process.env.WB_PASSWORD,
  headless: true,
})

const warehouses = await module.getWarehouses()
const stocksByWarehouse = {}

for (const w of warehouses) {
  stocksByWarehouse[w.id] = await module.getStocks(w.id)
}

const plan = module.buildTransferPlan({ warehouses, stocksByWarehouse })
for (const item of plan) {
  await module.sendTransfer(item)
}
```

## Авторизация и заполнение формы

1. Открыть https://seller.wildberries.ru/
2. Ввести логин и пароль
3. При наличии 2FA/капчи:
   - дождаться ручного подтверждения
   - либо встроить обработчик 2FA через SMS/Email (если доступно)
4. Перейти в раздел «Перемещение остатков»
5. Заполнить поля SKU / количество / склад отправки / склад назначения
6. Подтвердить заявку

## Очереди и лимиты

- Добавляйте заявки в очередь и обрабатывайте с таймингами 1–2 сек между запросами
- Для нестабильных запросов используйте повторные попытки (retry)
- Храните статус каждой заявки (queued/sent/error)

## Важно

- Автоматизация через браузер должна соблюдаться в рамках правил WB
- При 2FA может требоваться ручное подтверждение
- При изменении форм WB селекторы нужно обновлять
