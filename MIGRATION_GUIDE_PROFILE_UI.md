# Гайд по миграции UI профиля на новые компоненты

Этот гайд покажет, как обновить ProfilePage.tsx для использования новых компонентов выбора данных.

## Обзор изменений

**До:**
- Длинные списки кнопок занимают много места
- Плохой UX на мобильных
- Нет поиска
- Сложно видеть выбранные элементы

**После:**
- Компактные SelectField триггеры
- BottomSheet модальные окна
- Встроенный поиск
- ChipGroup для выбранных элементов
- Современный мобильный дизайн

## Шаг 1: Импорты

Добавьте импорты новых компонентов в начало ProfilePage.tsx:

```typescript
import SelectField from '../components/SelectField';
import SelectSheet from '../components/SelectSheet';
import ChipGroup from '../components/ChipGroup';
import FeatureSelector from '../components/FeatureSelector';
import PriceInputGroup from '../components/PriceInputGroup';
```

## Шаг 2: State для модальных окон

Добавьте state для управления открытием/закрытием BottomSheet:

```typescript
// После существующего useState
const [sheetStates, setSheetStates] = useState({
  fieldOfActivity: false,
  professions: false,
  artists: false,
  employer: false,
  service: false,
  genre: false,
  workFormat: false,
  employmentType: false,
  skillLevel: false,
  availability: false,
});

const openSheet = (key: keyof typeof sheetStates) => {
  setSheetStates({ ...sheetStates, [key]: true });
};

const closeSheet = (key: keyof typeof sheetStates) => {
  setSheetStates({ ...sheetStates, [key]: false });
};
```

## Шаг 3: Замена Field of Activity

**Удалить старый код (строки 412-441):**
```typescript
{isEditing && (
  <div>
    <label>Сфера деятельности</label>
    <div className="space-y-1">
      {fieldsOfActivity.map((field: any) => (
        // ... много строк кода с кнопками
      ))}
    </div>
  </div>
)}
```

**Заменить на:**
```typescript
{isEditing && (
  <>
    <SelectField
      label="Сфера деятельности"
      value={fieldsOfActivity.find(f => f.id === formData.fieldOfActivityId)?.name || ''}
      placeholder="Выберите сферу"
      icon={<Briefcase size={14} />}
      onClick={() => openSheet('fieldOfActivity')}
    />

    <SelectSheet
      isOpen={sheetStates.fieldOfActivity}
      onClose={() => closeSheet('fieldOfActivity')}
      title="Выберите сферу деятельности"
      options={fieldsOfActivity.map((f: any) => ({ id: f.id, name: f.name }))}
      selectedIds={formData.fieldOfActivityId}
      onSelect={(id) => {
        setFormData({ ...formData, fieldOfActivityId: id as string });
        closeSheet('fieldOfActivity');
      }}
      mode="single"
      searchable={false}
      height="auto"
    />
  </>
)}
```

## Шаг 4: Замена Professions

**Удалить старый код (строки 445-531):**
```typescript
{isEditing && formData.fieldOfActivityId && (
  <div>
    <label>Профессии</label>
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {professions.map((prof: any) => (
        // ... много строк кода с кнопками и features
      ))}
    </div>
  </div>
)}
```

**Заменить на:**
```typescript
{isEditing && formData.fieldOfActivityId && (
  <>
    <SelectField
      label="Профессии"
      value={formData.userProfessions.length > 0 ? `Выбрано: ${formData.userProfessions.length}` : ''}
      placeholder="Выберите профессии"
      icon={<Star size={14} />}
      onClick={() => openSheet('professions')}
      badge={formData.userProfessions.length}
    />

    {/* Отображение выбранных профессий */}
    {formData.userProfessions.length > 0 && (
      <ChipGroup
        chips={formData.userProfessions.map(up => {
          const prof = professions.find((p: any) => p.id === up.professionId);
          return {
            id: up.professionId,
            label: prof?.name || 'Профессия',
            color: 'primary' as const,
          };
        })}
        editable
        onRemove={(id) => {
          setFormData({
            ...formData,
            userProfessions: formData.userProfessions.filter(up => up.professionId !== id),
          });
        }}
      />
    )}

    {/* Features для каждой выбранной профессии */}
    {formData.userProfessions.length > 0 && (
      <div className="space-y-3">
        {formData.userProfessions.map(up => {
          const prof = professions.find((p: any) => p.id === up.professionId);
          return (
            <FeatureSelector
              key={up.professionId}
              title={prof?.name || 'Профессия'}
              features={professionFeatures}
              selectedFeatureNames={up.features}
              onToggle={(featureName) => {
                setFormData({
                  ...formData,
                  userProfessions: formData.userProfessions.map(p => {
                    if (p.professionId !== up.professionId) return p;
                    return {
                      ...p,
                      features: p.features.includes(featureName)
                        ? p.features.filter(f => f !== featureName)
                        : [...p.features, featureName],
                    };
                  }),
                });
              }}
            />
          );
        })}
      </div>
    )}

    <SelectSheet
      isOpen={sheetStates.professions}
      onClose={() => closeSheet('professions')}
      title="Выберите профессии"
      options={professions.map((p: any) => ({ id: p.id, name: p.name }))}
      selectedIds={formData.userProfessions.map(up => up.professionId)}
      onSelect={(ids) => {
        const newProfessions = (ids as string[]).map(id => ({
          professionId: id,
          features: formData.userProfessions.find(up => up.professionId === id)?.features || [],
        }));
        setFormData({ ...formData, userProfessions: newProfessions });
      }}
      mode="multiple"
      searchable
      searchPlaceholder="Поиск профессии..."
      showConfirm
      height="full"
    />
  </>
)}
```

## Шаг 5: Замена Artists

**Удалить старый код (строки 535-578):**

**Заменить на:**
```typescript
{isEditing && (
  <>
    <SelectField
      label="Мой артист / Группа"
      value={formData.artistIds.length > 0 ? `Выбрано: ${formData.artistIds.length}` : ''}
      placeholder="Выберите артистов"
      icon={<Music size={14} />}
      onClick={() => openSheet('artists')}
      badge={formData.artistIds.length}
    />

    <ChipGroup
      chips={formData.artistIds.map(id => {
        const artist = artists.find((a: any) => a.id === id);
        return {
          id,
          label: artist?.name || 'Артист',
          color: 'purple' as const,
          icon: <Music size={14} />
        };
      })}
      editable
      onRemove={(id) => {
        setFormData({ ...formData, artistIds: formData.artistIds.filter(artId => artId !== id) });
      }}
      emptyText="Артисты не выбраны"
    />

    <SelectSheet
      isOpen={sheetStates.artists}
      onClose={() => closeSheet('artists')}
      title="Выберите артистов"
      options={artists.map((a: any) => ({ id: a.id, name: a.name }))}
      selectedIds={formData.artistIds}
      onSelect={(ids) => setFormData({ ...formData, artistIds: ids as string[] })}
      mode="multiple"
      searchable
      searchPlaceholder="Поиск артиста или группы..."
      showConfirm
      height="half"
    />
  </>
)}
```

## Шаг 6: Замена Employer

**Удалить старый код (строки 582-625):**

**Заменить на:**
```typescript
{isEditing && (
  <>
    <SelectField
      label="Работодатель"
      value={employers.find((e: any) => e.id === formData.employerId)?.name || ''}
      placeholder="Выберите работодателя"
      icon={<Building2 size={14} />}
      onClick={() => openSheet('employer')}
    />

    <SelectSheet
      isOpen={sheetStates.employer}
      onClose={() => closeSheet('employer')}
      title="Выберите работодателя"
      options={employers.map((e: any) => ({
        id: e.id,
        name: e.name,
        subtitle: e.inn ? `ИНН: ${e.inn}` : undefined,
      }))}
      selectedIds={formData.employerId}
      onSelect={(id) => {
        setFormData({ ...formData, employerId: id as string });
        closeSheet('employer');
      }}
      mode="single"
      searchable
      searchPlaceholder="Поиск по названию, ИНН или ОГРН..."
      height="half"
    />
  </>
)}
```

## Шаг 7: Замена Search Profile параметров

Замените все `<select>` элементы в секции "Параметры поиска" на SelectField + SelectSheet:

**Для Service:**
```typescript
<SelectField
  label="Услуга"
  value={services.find((s: any) => s.id === searchProfile.serviceId)?.name || ''}
  placeholder="Выберите услугу"
  icon={<Headphones size={14} />}
  onClick={() => openSheet('service')}
/>

<SelectSheet
  isOpen={sheetStates.service}
  onClose={() => closeSheet('service')}
  title="Выберите услугу"
  options={services.map((s: any) => ({ id: s.id, name: s.name }))}
  selectedIds={searchProfile.serviceId}
  onSelect={(id) => {
    setSearchProfile({ ...searchProfile, serviceId: id as string, genreId: '' });
    closeSheet('service');
  }}
  mode="single"
  height="auto"
/>
```

Аналогично для Genre, WorkFormat, EmploymentType, SkillLevel, Availability.

**Для цен, замените на PriceInputGroup:**
```typescript
<PriceInputGroup
  pricePerHour={searchProfile.pricePerHour}
  pricePerEvent={searchProfile.pricePerEvent}
  onPricePerHourChange={(value) => setSearchProfile({ ...searchProfile, pricePerHour: value })}
  onPricePerEventChange={(value) => setSearchProfile({ ...searchProfile, pricePerEvent: value })}
/>
```

## Шаг 8: Тестирование

1. Проверьте, что все модальные окна открываются/закрываются
2. Протестируйте поиск в списках
3. Проверьте выбор и удаление элементов через чипы
4. Протестируйте на мобильном устройстве
5. Проверьте сохранение данных

## Результат

✅ Компактный UI - меньше скроллинга
✅ Лучший UX на мобильных - нативные модальные окна
✅ Быстрый поиск по спискам
✅ Визуальная индикация выбранных элементов
✅ Легкое удаление через чипы
✅ Современный дизайн
✅ Меньше кода - reusable компоненты

## Дополнительно

Вы можете кастомизировать:
- Высоту модальных окон (`height` prop)
- Цвета чипов (`color` prop в ChipGroup)
- Placeholder текст
- Включить/выключить поиск
- Добавить иконки к опциям
- Добавить подзаголовки

Все компоненты полностью типизированы TypeScript и документированы.
