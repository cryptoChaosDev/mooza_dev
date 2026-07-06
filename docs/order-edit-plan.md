# Заказ — редактирование (только черновики) + перевод в черновик

Правило (от заказчика): **редактировать можно только ЧЕРНОВИК**. Активный заказ редактировать
нельзя — его сперва нужно перевести в черновик (он снимается с публикации), затем
редактировать, затем при желании опубликовать заново.

Бэкенд уже поддерживает `orderAPI.update` (PATCH /orders/:id), `orderAPI.setStatus` (любой
статус), references-эндпоинты. Не хватает: (а) guard «edit only draft» на PATCH /:id; (б)
снятие поста из ленты при уходе из active; (в) всего фронтового UI редактирования + действия
«В черновик»; (г) edit-режима в OrderForm.

Статусы: `active` (опубликован, в ленте) · `draft` (черновик, не в ленте) · `archived` (в архиве,
не в ленте).

---

## ОБЩИЙ КОНТРАКТ OrderForm (точка стыковки фронтовых агентов)

`client/src/components/OrderForm.tsx` экспортирует `export default function OrderForm`.
Новая сигнатура (обратносовместима):

```
function OrderForm({ onClose, order }: { onClose: () => void; order?: any })
```

- `order` НЕ передан → режим СОЗДАНИЯ (как сейчас). Существующие вызовы в FeedPage.tsx и
  ProfilePage.tsx (`<OrderForm onClose={...} />`) остаются рабочими без изменений.
- `order` передан (полный объект из `orderAPI.getOne(id)`.data) → режим РЕДАКТИРОВАНИЯ.
- `const isEdit = !!order;`

Полный объект `order` из getOne (форма):
```
{
  id, authorId, status: 'active'|'draft'|'archived',
  title, description: string|null,
  budgetFrom: number|null, budgetTo: number|null,
  deadline: string|null,                 // полный ISO, напр. 2026-07-01T00:00:00.000Z
  serviceId,
  service: { id, name, section: { id, name } },
  selectedCustomFilterValues: [ { id, value, filter: { id, name } } ],
  referenceFiles: [ { id, orderId, url, originalName, size, mimeType, createdAt } ],
  referenceLinks: [ { id, orderId, url, title, source, createdAt } ],
  _count: { responses }, isOwner
}
```

---

## ЗАДАЧА A — backend: server/src/routes/orders.ts

1. **PATCH /:id (update)** — после проверки владельца (там где `order.authorId !== meId` → 404),
   ДОБАВИТЬ guard статуса (используя уже загруженный `order.status`):
   ```
   if (order.status !== 'draft') {
     return res.status(409).json({ error: 'Редактировать можно только черновик. Сначала переведите заказ в черновик.' });
   }
   ```
   Это разрешает редактировать черновик и при этом опубликовать его (status в теле может быть
   'active' — переход draft→active при «Опубликовать» из формы). Активный/архивный — отвергаются.
   НЕ менять остальную логику update (она уже принимает status и синхронит пост при active).

2. **PATCH /:id/status** — сейчас при `status === 'active'` вызывается `syncOrderPost(...)`, а при
   уходе из active пост остаётся в ленте (заказ остаётся публично виден — баг). ДОБАВИТЬ else-ветку:
   при смене на не-active удалять связанный пост ленты, чтобы заказ реально снялся с публикации:
   ```
   if (status === 'active') {
     await syncOrderPost(updated.id, updated.authorId, updated.title, updated.description);
   } else {
     await prisma.post.deleteMany({ where: { orderId: updated.id, type: 'order' } });
   }
   ```
   (точные имена аргументов syncOrderPost взять из текущего кода — не менять её сигнатуру).

Больше ничего в бэкенде не трогать. После правок — `cd server && npx tsc --noEmit` чисто.

---

## ЗАДАЧА B — OrderForm edit-режим: client/src/components/OrderForm.tsx

Реализовать режим редактирования по ОБЩЕМУ КОНТРАКТУ выше. Конкретно:

1. **Сигнатура**: добавить опциональный проп `order?: any`; `const isEdit = !!order;`.

2. **Новое состояние** рядом с `refFiles`: `const [existingFiles, setExistingFiles] = useState<any[]>([]);`
   (серверные референс-файлы существующего заказа; отдельно от `refFiles: File[]` — новые загрузки).

3. **Эффект префилла** (выполнить ОДИН раз на mount, только когда `isEdit`):
   - `discardedRef.current = true;` — ОТКЛЮЧИТЬ тихий автосейв-черновик на unmount (иначе закрытие
     формы редактирования создаст дубль-черновик). (имя рефа взять из текущего кода — он есть.)
   - `setTitle(order.title || '')`
   - `setServiceId(order.service?.id || order.serviceId || '')`,
     `setServiceName(order.service?.name || '')`, `setSectionName(order.service?.section?.name || '')`
   - `setBudgetFrom(order.budgetFrom != null ? String(order.budgetFrom) : '')`,
     `setBudgetTo(order.budgetTo != null ? String(order.budgetTo) : '')`
   - deadline: `if (order.deadline) { setDeadlineEnabled(true); setDeadlineDate(String(order.deadline).slice(0,10)); }`
     (ISO → YYYY-MM-DD для нативного date input)
   - `setDescription(order.description ?? '')`
   - `setRefLinks((order.referenceLinks || []).map((l:any) => ({ url: l.url, title: l.title, source: l.source })))`
   - `setExistingFiles(order.referenceFiles || [])`
   - Подгрузить опции фильтров выбранного сервиса и сгруппировать выбранные значения:
     ```
     const sid = order.service?.id || order.serviceId;
     if (sid) {
       setLoadingDetail(true);
       referenceAPI.getServiceDetail(sid)
         .then(({ data }: any) => {
           setFilters(data.filters || []);
           const sel: Record<string,string[]> = {};
           for (const v of (order.selectedCustomFilterValues || [])) {
             (sel[v.filter.id] = sel[v.filter.id] || []).push(v.id);
           }
           setFilterSel(sel);
         })
         .catch(() => {})
         .finally(() => setLoadingDetail(false));
     }
     ```
     ВАЖНО: НЕ использовать `selectCatalogService` для префилла (она сбрасывает filterSel).
     Выставлять serviceId/serviceName/sectionName/filters/filterSel напрямую сеттерами.

4. **Submit routing** — в `publish()` и `saveDraft()` заменить вызов create на ветвление:
   ```
   const saved = isEdit
     ? await orderAPI.update(order.id, buildPayload('active'))     // в saveDraft → 'draft'
     : await orderAPI.create(buildPayload('active'));              // в saveDraft → 'draft'
   const newId = isEdit ? order.id : saved.data.id;
   await uploadRefs(newId);
   ```
   (buildPayload уже PATCH-совместим — менять его НЕ нужно.)
   В обоих путях оставить `queryClient.invalidateQueries({ queryKey: ['orders','mine'] })`; ДОПОЛНИТЕЛЬНО
   инвалидировать деталь заказа: `queryClient.invalidateQueries({ queryKey: ['order', order.id] })`
   когда `isEdit` (ключ детали заказа — ['order', id], см. задачу C).

5. **Блок существующих файлов** — отрисовать `existingFiles` (если есть) над/рядом со списком новых
   загрузок `refFiles`, у каждого — имя (originalName) и кнопка удаления:
   ```
   await orderAPI.deleteReference(order.id, f.id);
   setExistingFiles(prev => prev.filter(x => x.id !== f.id));
   ```
   Стиль — как у элементов списка `refFiles` рядом (повторить классы соседнего блока).

6. **Косметика edit-режима**:
   - Заголовок формы (сейчас «Новый заказ») → `isEdit ? 'Редактирование заказа' : 'Новый заказ'`.
   - Кнопка «В черновики» (saveDraft) → в edit-режиме подпись `isEdit ? 'Сохранить черновик' : 'В черновики'`.
   - Кнопка «Опубликовать» (publish) — оставить.

После правок — `cd client && npx tsc --noEmit` чисто (использовать `any` для order/типов, как принято в проекте).

---

## ЗАДАЧА C — wiring кнопок: client/src/pages/OrdersPage.tsx + client/src/pages/OrderDetailPage.tsx

Реализовать матрицу действий по статусу/вкладке. Импортировать `OrderForm` (`import OrderForm from
'../components/OrderForm'`) и `useQueryClient` где нужно. Открытие формы редактирования: для списка
надо сперва дотянуть полный заказ через `orderAPI.getOne(id)` (getMine не отдаёт нужных полей), затем
смонтировать `<OrderForm order={fullOrder} onClose={...} />`.

### OrdersPage.tsx
Состояние: `const [editingOrder, setEditingOrder] = useState<any>(null);` (+ при желании loading-флаг
на время getOne). Рендер около корня страницы:
```
{editingOrder && (
  <OrderForm
    order={editingOrder}
    onClose={() => { setEditingOrder(null); queryClient.invalidateQueries({ queryKey: ['orders','mine'] }); }}
  />
)}
```
Матрица кнопок на карточке в зависимости от вкладки/`order.status` (НЕ менять навигацию по клику на
тело карточки — пусть открывает деталь):
- **active**: [«В черновик» → statusMut(id, 'draft')]  [«В архив» → statusMut(id, 'archived')]. БЕЗ «Редактировать».
- **draft**:  [«Редактировать» → `orderAPI.getOne(order.id).then(({data}) => setEditingOrder(data))`]  [«Опубликовать» → statusMut(id, 'active')].
- **archived**: [«Опубликовать» → statusMut(id, 'active')]  [«В черновик» → statusMut(id, 'draft')].

Старая кнопка «Редактировать» (Pencil), которая сейчас просто `navigate('/orders/:id')` — её
поведение заменить на открытие формы (и показывать ТОЛЬКО для draft). Существующий statusMut
(orderAPI.setStatus) переиспользовать; если он принимает только {status} — расширить, чтобы знал id
карточки (как сделано для текущих кнопок). На вкладке active заменить единственную «В архив» на пару
«В черновик»+«В архив»; на archived/draft — пара как выше.

### OrderDetailPage.tsx
У владельца (isOwner) добавить состояние `const [editing, setEditing] = useState(false);` и рендер:
```
{editing && (
  <OrderForm
    order={order}
    onClose={() => { setEditing(false); queryClient.invalidateQueries({ queryKey: ['order', orderId] }); }}
  />
)}
```
(orderId/order уже есть на странице; ключ запроса детали — подтвердить в коде, обычно `['order', orderId]`
— использовать фактический ключ из useQuery этой страницы и его же инвалидировать.)
Кнопки владельца по `order.status` (сейчас есть только «В архив» при active):
- **active**: [«В черновик» → setStatus(orderId,'draft')]  [«В архив» → setStatus(orderId,'archived')].
- **draft**:  [«Редактировать» → `setEditing(true)`]  [«Опубликовать» → setStatus(orderId,'active')].
- **archived**: [«Опубликовать» → setStatus(orderId,'active')]  [«В черновик» → setStatus(orderId,'draft')].
Переиспользовать существующий паттерн мутации статуса (archiveMut → обобщить до setStatus с нужным
значением, или добавить аналогичные мутации). Стиль кнопок — как у текущей «В архив».

После правок — `cd client && npx tsc --noEmit` чисто.

---

## Проверка (после всех правок)
- `cd client && npx tsc --noEmit` → 0; `cd server && npx tsc --noEmit` → 0.
- Логика: draft → «Редактировать» открывает форму с заполненными полями (сервис, фильтры, бюджет,
  срок, описание, ссылки, файлы), «Сохранить черновик»/«Опубликовать» работают; active → «Редактировать»
  нет, есть «В черновик» (снимает с ленты) → затем редактируется как черновик.
