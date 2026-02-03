/**
 * Пример рефакторинга секции выбора Field of Activity и Professions
 * из ProfilePage.tsx с использованием новых компонентов
 *
 * БЫЛО (старый код):
 * - Список кнопок с радио-индикаторами для Field of Activity
 * - Длинный список кнопок с чекбоксами для Professions
 * - Все отображается inline, занимает много места
 *
 * СТАЛО (новый код с BottomSheet):
 * - Компактное поле SelectField
 * - SelectSheet модальное окно для выбора
 * - ChipGroup для отображения выбранных элементов
 */

import { useState } from 'react';
import SelectField from './SelectField';
import SelectSheet from './SelectSheet';
import ChipGroup from './ChipGroup';
import { Briefcase, Star } from 'lucide-react';

// Типы для примера
interface FieldOfActivity {
  id: string;
  name: string;
}

interface Profession {
  id: string;
  name: string;
}

interface ProfileFieldSelectionExampleProps {
  fieldsOfActivity: FieldOfActivity[];
  professions: Profession[];
  selectedFieldId: string;
  selectedProfessionIds: string[];
  onFieldChange: (id: string) => void;
  onProfessionsChange: (ids: string[]) => void;
}

export default function ProfileFieldSelectionExample({
  fieldsOfActivity,
  professions,
  selectedFieldId,
  selectedProfessionIds,
  onFieldChange,
  onProfessionsChange,
}: ProfileFieldSelectionExampleProps) {
  const [isFieldSheetOpen, setIsFieldSheetOpen] = useState(false);
  const [isProfessionSheetOpen, setIsProfessionSheetOpen] = useState(false);

  // Получить название выбранной сферы
  const selectedFieldName =
    fieldsOfActivity.find((f) => f.id === selectedFieldId)?.name || '';

  // Преобразовать выбранные профессии в чипы
  const selectedProfessionsChips = selectedProfessionIds.map((id) => {
    const prof = professions.find((p) => p.id === id);
    return {
      id,
      label: prof?.name || '',
      color: 'primary' as const,
    };
  });

  const handleRemoveProfession = (id: string) => {
    onProfessionsChange(selectedProfessionIds.filter((profId) => profId !== id));
  };

  return (
    <div className="space-y-5">
      {/* Field of Activity Selection */}
      <div>
        <SelectField
          label="Сфера деятельности"
          value={selectedFieldName}
          placeholder="Выберите сферу"
          icon={<Briefcase size={14} />}
          onClick={() => setIsFieldSheetOpen(true)}
        />

        <SelectSheet
          isOpen={isFieldSheetOpen}
          onClose={() => setIsFieldSheetOpen(false)}
          title="Выберите сферу деятельности"
          options={fieldsOfActivity.map((f) => ({ id: f.id, name: f.name }))}
          selectedIds={selectedFieldId}
          onSelect={(id) => onFieldChange(id as string)}
          mode="single"
          searchable={false}
          height="auto"
        />
      </div>

      {/* Professions Selection */}
      {selectedFieldId && (
        <div>
          <SelectField
            label="Профессии"
            value={
              selectedProfessionIds.length > 0
                ? `Выбрано: ${selectedProfessionIds.length}`
                : ''
            }
            placeholder="Выберите профессии"
            icon={<Star size={14} />}
            onClick={() => setIsProfessionSheetOpen(true)}
            badge={selectedProfessionIds.length}
          />

          {/* Отображаем выбранные профессии */}
          {selectedProfessionIds.length > 0 && (
            <div className="mt-3">
              <ChipGroup
                chips={selectedProfessionsChips}
                editable
                onRemove={handleRemoveProfession}
              />
            </div>
          )}

          <SelectSheet
            isOpen={isProfessionSheetOpen}
            onClose={() => setIsProfessionSheetOpen(false)}
            title="Выберите профессии"
            options={professions.map((p) => ({ id: p.id, name: p.name }))}
            selectedIds={selectedProfessionIds}
            onSelect={(ids) => onProfessionsChange(ids as string[])}
            mode="multiple"
            searchable
            searchPlaceholder="Поиск профессии..."
            emptyText="Профессия не найдена"
            showConfirm
            height="full"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Как интегрировать в ProfilePage.tsx:
 *
 * 1. Импортируйте компонент:
 *    import ProfileFieldSelectionExample from '../components/ProfileFieldSelectionExample';
 *
 * 2. Замените старую секцию "Field of Activity (edit mode)" и "Professions (edit mode)":
 *    {isEditing && (
 *      <ProfileFieldSelectionExample
 *        fieldsOfActivity={fieldsOfActivity}
 *        professions={professions}
 *        selectedFieldId={formData.fieldOfActivityId}
 *        selectedProfessionIds={formData.userProfessions.map(up => up.professionId)}
 *        onFieldChange={(id) => setFormData({ ...formData, fieldOfActivityId: id })}
 *        onProfessionsChange={(ids) => {
 *          setFormData({
 *            ...formData,
 *            userProfessions: ids.map(id => ({ professionId: id, features: [] })),
 *          });
 *        }}
 *      />
 *    )}
 *
 * 3. Удалите старый код (строки 412-531 в ProfilePage.tsx)
 */

/**
 * Преимущества нового подхода:
 *
 * ✅ Экономия места - списки скрыты до клика
 * ✅ Лучший UX на мобильных - полноэкранные модальные окна
 * ✅ Поиск - быстро найти нужную профессию
 * ✅ Визуальная индикация - чипы показывают выбранные элементы
 * ✅ Легко удалить - крестик на каждом чипе
 * ✅ Современный дизайн - следует паттернам iOS/Android
 * ✅ Анимации - плавные transitions
 * ✅ Accessibility - поддержка клавиатуры
 * ✅ Меньше кода - reusable компоненты
 */
