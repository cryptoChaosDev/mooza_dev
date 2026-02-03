# Компоненты выбора данных

Набор компонентов для современного и удобного выбора данных в мобильных и десктопных интерфейсах.

## Компоненты

### 1. BottomSheet
Базовый компонент модального окна, появляющегося снизу экрана (как в iOS/Android приложениях).

**Props:**
- `isOpen: boolean` - состояние открыто/закрыто
- `onClose: () => void` - callback при закрытии
- `title: string` - заголовок модального окна
- `children: React.ReactNode` - содержимое
- `height?: 'auto' | 'half' | 'full'` - высота модального окна (default: 'half')

**Особенности:**
- Backdrop с blur эффектом
- Drag handle для закрытия жестом
- Плавная анимация появления
- Блокировка скролла body при открытии
- Закрытие по клику на backdrop

### 2. SelectSheet
Компонент для выбора одного или нескольких элементов с поиском.

**Props:**
- `isOpen: boolean` - состояние открыто/закрыто
- `onClose: () => void` - callback при закрытии
- `title: string` - заголовок
- `options: SelectOption[]` - массив опций для выбора
- `selectedIds: string | string[]` - ID выбранных элементов
- `onSelect: (ids: string | string[]) => void` - callback выбора
- `mode?: 'single' | 'multiple'` - режим выбора (default: 'single')
- `searchable?: boolean` - показывать поиск (default: true)
- `searchPlaceholder?: string` - placeholder для поиска
- `emptyText?: string` - текст когда нет результатов
- `height?: 'auto' | 'half' | 'full'` - высота
- `showConfirm?: boolean` - показывать кнопку подтверждения (для multiple)

**SelectOption:**
```typescript
interface SelectOption {
  id: string;
  name: string;
  subtitle?: string;
  icon?: React.ReactNode;
}
```

**Особенности:**
- Поиск в реальном времени
- Визуальная индикация выбора (radio/checkbox)
- Поддержка иконок
- Подзаголовки для дополнительной информации
- Кнопка подтверждения для множественного выбора
- Плавные анимации

### 3. ChipGroup
Компонент для отображения выбранных элементов в виде чипов (badges).

**Props:**
- `chips: Chip[]` - массив чипов
- `onRemove?: (id: string) => void` - callback удаления чипа
- `editable?: boolean` - можно ли удалять чипы (default: false)
- `emptyText?: string` - текст когда нет чипов

**Chip:**
```typescript
interface Chip {
  id: string;
  label: string;
  icon?: React.ReactNode;
  color?: 'primary' | 'purple' | 'green' | 'blue' | 'orange';
}
```

**Особенности:**
- Разные цветовые схемы
- Поддержка иконок
- Кнопка удаления (если editable=true)
- Автоматический перенос строк
- Плавные анимации

### 4. SelectField
Поле-триггер для открытия SelectSheet.

**Props:**
- `label: string` - метка поля
- `value: string` - отображаемое значение
- `placeholder?: string` - placeholder когда не выбрано
- `icon?: React.ReactNode` - иконка рядом с меткой
- `onClick: () => void` - callback клика
- `disabled?: boolean` - заблокировано ли поле
- `badge?: number` - счетчик выбранных элементов

**Особенности:**
- Визуальная индикация выбранного/невыбранного состояния
- Badge для количества выбранных элементов
- Стрелка справа
- Состояние disabled
- Active state анимация

## Примеры использования

### Пример 1: Одиночный выбор (Radio)

```typescript
import { useState } from 'react';
import SelectField from './components/SelectField';
import SelectSheet from './components/SelectSheet';
import { Briefcase } from 'lucide-react';

function ProfileForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedField, setSelectedField] = useState('');

  const fieldsOfActivity = [
    { id: '1', name: 'Музыкальное производство' },
    { id: '2', name: 'Звукорежиссура' },
    { id: '3', name: 'Исполнительское искусство' },
  ];

  const selectedFieldName = fieldsOfActivity.find(f => f.id === selectedField)?.name || '';

  return (
    <>
      <SelectField
        label="Сфера деятельности"
        value={selectedFieldName}
        placeholder="Выберите сферу"
        icon={<Briefcase size={14} />}
        onClick={() => setIsOpen(true)}
      />

      <SelectSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Выберите сферу деятельности"
        options={fieldsOfActivity}
        selectedIds={selectedField}
        onSelect={(id) => setSelectedField(id as string)}
        mode="single"
      />
    </>
  );
}
```

### Пример 2: Множественный выбор (Checkbox) с ChipGroup

```typescript
import { useState } from 'react';
import SelectField from './components/SelectField';
import SelectSheet from './components/SelectSheet';
import ChipGroup from './components/ChipGroup';
import { Music } from 'lucide-react';

function ProfileForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedArtists, setSelectedArtists] = useState<string[]>([]);

  const artists = [
    { id: '1', name: 'Макс Корж' },
    { id: '2', name: 'Скриптонит' },
    { id: '3', name: 'Oxxxymiron' },
  ];

  const selectedArtistsChips = selectedArtists.map(id => {
    const artist = artists.find(a => a.id === id);
    return {
      id,
      label: artist?.name || '',
      color: 'purple' as const,
      icon: <Music size={14} />
    };
  });

  const handleRemoveArtist = (id: string) => {
    setSelectedArtists(prev => prev.filter(artId => artId !== id));
  };

  return (
    <>
      <SelectField
        label="Артисты / Группы"
        value={selectedArtists.length > 0 ? `Выбрано: ${selectedArtists.length}` : ''}
        placeholder="Выберите артистов"
        icon={<Music size={14} />}
        onClick={() => setIsOpen(true)}
        badge={selectedArtists.length}
      />

      <ChipGroup
        chips={selectedArtistsChips}
        editable
        onRemove={handleRemoveArtist}
        emptyText="Артисты не выбраны"
      />

      <SelectSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Выберите артистов"
        options={artists}
        selectedIds={selectedArtists}
        onSelect={(ids) => setSelectedArtists(ids as string[])}
        mode="multiple"
        showConfirm
      />
    </>
  );
}
```

### Пример 3: С поиском и подзаголовками

```typescript
const employers = [
  {
    id: '1',
    name: 'ООО "Музыкальная студия"',
    subtitle: 'ИНН: 7701234567',
  },
  {
    id: '2',
    name: 'ИП Иванов И.И.',
    subtitle: 'ИНН: 123456789012',
  },
];

<SelectSheet
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Выберите работодателя"
  options={employers}
  selectedIds={selectedEmployer}
  onSelect={(id) => setSelectedEmployer(id as string)}
  mode="single"
  searchable
  searchPlaceholder="Поиск по названию или ИНН..."
  emptyText="Работодатель не найден"
/>
```

## Преимущества

✅ **Мобильный-first дизайн** - интуитивно понятен на сенсорных экранах
✅ **Современный UI** - следует лучшим практикам iOS/Android
✅ **Поиск** - быстрый поиск по большим спискам
✅ **Accessibility** - поддержка клавиатуры и screen readers
✅ **Анимации** - плавные transitions для лучшего UX
✅ **Гибкость** - настраиваемые цвета, иконки, высота
✅ **TypeScript** - полная типизация

## Best Practices

1. **Используйте SelectField + SelectSheet вместо стандартных `<select>`** - лучший UX на мобильных
2. **Добавляйте поиск для списков > 10 элементов**
3. **Используйте иконки для визуальной идентификации**
4. **Для множественного выбора показывайте ChipGroup с выбранными элементами**
5. **Добавляйте badge с количеством для множественного выбора**
6. **Используйте подзаголовки для дополнительной информации (ИНН, email, etc)**
7. **Устанавливайте `showConfirm={true}` для множественного выбора, чтобы пользователь мог просмотреть выбор перед применением**
