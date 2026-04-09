import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AppTopBar } from '../components/AppTopBar';
import { RootStackParamList } from '../navigation/RootNavigator';
import { Colors } from '../theme/colors';
import { toUserFriendlyError } from '../utils/httpError';

type TournamentCategoryItem = {
  id: string;
  name: string;
  discipline: string;
  format: string;
  maxParticipants: number;
};

type TournamentItem = {
  id: string;
  name: string;
  location: string | null;
  startDate: string;
  endDate: string;
  status: string;
  registrationStatus: 'OPEN' | 'CLOSED';
  registrationCloseAt: string | null;
  club: ClubItem | null;
  categories: TournamentCategoryItem[];
};

type TournamentType = 'AMERICANO' | 'GROUP_STAGE' | 'PLAYOFF';
type Navigation = NativeStackNavigationProp<RootStackParamList>;
type DatePickerTarget = 'start' | 'end' | 'registration';

type DatePickerState = {
  target: DatePickerTarget;
  mode: 'date' | 'time';
};

type ClubItem = {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  courtsCount: number;
  isActive: boolean;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDateInput(date: Date): string {
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

function formatTimeInput(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Дата не вказана';
  }

  return `${formatDateInput(parsed)} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function parseDateTimeInput(dateInput: string, timeInput: string): Date | null {
  const dateMatch = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dateInput.trim());
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeInput.trim());

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const day = Number.parseInt(dateMatch[1], 10);
  const month = Number.parseInt(dateMatch[2], 10);
  const year = Number.parseInt(dateMatch[3], 10);
  const hour = Number.parseInt(timeMatch[1], 10);
  const minute = Number.parseInt(timeMatch[2], 10);

  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute
  ) {
    return null;
  }

  return parsed;
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Dates pending';
  }

  const startPart = `${formatDateInput(start)} ${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const endPart = `${formatDateInput(end)} ${pad(end.getHours())}:${pad(end.getMinutes())}`;

  return `${startPart} - ${endPart}`;
}

export function TournamentsScreen() {
  const navigation = useNavigation<Navigation>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [tournaments, setTournaments] = useState<TournamentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clubs, setClubs] = useState<ClubItem[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [clubsError, setClubsError] = useState<string | null>(null);

  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState<TournamentType>('AMERICANO');
  const [createStartDate, setCreateStartDate] = useState(() => {
    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 1);
    return formatDateInput(nextDay);
  });
  const [createStartTime, setCreateStartTime] = useState('10:00');
  const [createEndDate, setCreateEndDate] = useState(() => {
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 1);
    return formatDateInput(dayAfter);
  });
  const [createEndTime, setCreateEndTime] = useState('18:00');
  const [createRegistrationDate, setCreateRegistrationDate] = useState(() => {
    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 1);
    return formatDateInput(nextDay);
  });
  const [createRegistrationTime, setCreateRegistrationTime] = useState('09:00');
  const [selectedClubId, setSelectedClubId] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createMaxPlayers, setCreateMaxPlayers] = useState('16');
  const [showClubPicker, setShowClubPicker] = useState(false);
  const [clubSearchInput, setClubSearchInput] = useState('');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [datePickerState, setDatePickerState] = useState<DatePickerState | null>(null);

  const selectedClub = useMemo(
    () => clubs.find((club) => club.id === selectedClubId) ?? null,
    [clubs, selectedClubId],
  );

  const selectedClubLabel = useMemo(() => {
    if (!selectedClub) {
      return 'Клуб не обрано';
    }

    return [selectedClub.name, selectedClub.city].filter(Boolean).join(' · ');
  }, [selectedClub]);

  const visibleClubs = useMemo(() => {
    const query = clubSearchInput.trim().toLowerCase();
    const source = query
      ? clubs.filter((club) =>
          [club.name, club.city, club.address]
            .filter((part): part is string => Boolean(part))
            .some((part) => part.toLowerCase().includes(query)),
        )
      : clubs;

    return source.slice(0, query ? 10 : 5);
  }, [clubSearchInput, clubs]);

  const loadTournaments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await apiClient.get<TournamentItem[]>('/tournaments');
      setTournaments(data);
    } catch (requestError) {
      setTournaments([]);
      setError(toUserFriendlyError(requestError, 'Could not load tournaments'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadClubs = useCallback(async () => {
    if (!isAdmin) {
      setClubs([]);
      setSelectedClubId('');
      return;
    }

    setClubsLoading(true);
    setClubsError(null);

    try {
      const { data } = await apiClient.get<ClubItem[]>('/clubs');
      const activeClubs = data.filter((club) => club.isActive !== false);
      setClubs(activeClubs);

      setSelectedClubId((previous) => {
        if (previous && activeClubs.some((club) => club.id === previous)) {
          return previous;
        }

        return activeClubs[0]?.id ?? '';
      });
    } catch (requestError) {
      setClubs([]);
      setClubsError(toUserFriendlyError(requestError, 'Не вдалося завантажити клуби'));
    } finally {
      setClubsLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadTournaments();
  }, [loadTournaments]);

  useEffect(() => {
    void loadClubs();
  }, [loadClubs]);

  const handleCreateTournament = useCallback(async () => {
    const trimmedName = createName.trim();
    const maxPlayers = Number.parseInt(createMaxPlayers, 10);
    const parsedStartDate = parseDateTimeInput(createStartDate, createStartTime);
    const parsedEndDate = parseDateTimeInput(createEndDate, createEndTime);
    const parsedRegistrationDeadline = parseDateTimeInput(createRegistrationDate, createRegistrationTime);

    setCreateError(null);
    setCreateSuccess(null);

    if (!trimmedName) {
      setCreateError('Вкажи назву турніру');
      return;
    }

    if (!selectedClub) {
      setCreateError('Обери клуб для турніру');
      return;
    }

    if (!parsedStartDate || !parsedEndDate || !parsedRegistrationDeadline) {
      setCreateError('Перевір формат дати/часу. Формат: 10-05-2026 і 18:30');
      return;
    }

    if (parsedStartDate > parsedEndDate) {
      setCreateError('Дата початку не може бути пізніше дати завершення');
      return;
    }

    if (parsedRegistrationDeadline > parsedStartDate) {
      setCreateError('Кінець реєстрації має бути до старту турніру');
      return;
    }

    if (!Number.isFinite(maxPlayers) || maxPlayers < 4 || maxPlayers > 512) {
      setCreateError('Кількість гравців: від 4 до 512');
      return;
    }

    if (createType === 'AMERICANO' && maxPlayers % 4 !== 0) {
      setCreateError('Для AMERICANO кількість гравців має бути кратною 4');
      return;
    }

    setIsCreating(true);

    try {
      const location = [selectedClub.name, selectedClub.city, selectedClub.address]
        .filter((part): part is string => Boolean(part))
        .join(', ');

      await apiClient.post('/tournaments', {
        name: trimmedName,
        type: createType,
        date: parsedStartDate.toISOString(),
        startDate: parsedStartDate.toISOString(),
        endDate: parsedEndDate.toISOString(),
        registrationCloseAt: parsedRegistrationDeadline.toISOString(),
        description: createDescription.trim() || undefined,
        openRegistration: true,
        clubId: selectedClub.id,
        courtsCount: selectedClub.courtsCount,
        maxPlayers,
        location: location || undefined,
      });

      setCreateSuccess('Турнір створено');
      setCreateName('');
      setCreateDescription('');
      setCreateMaxPlayers('16');
      setClubSearchInput('');
      setShowClubPicker(false);
      setShowTypePicker(false);
      await loadTournaments();
    } catch (requestError) {
      setCreateError(toUserFriendlyError(requestError, 'Не вдалося створити турнір'));
    } finally {
      setIsCreating(false);
    }
  }, [
    createEndDate,
    createEndTime,
    createDescription,
    createMaxPlayers,
    createName,
    createRegistrationDate,
    createRegistrationTime,
    createStartDate,
    createStartTime,
    createType,
    loadTournaments,
    selectedClub,
  ]);

  const handleRefresh = useCallback(() => {
    void loadTournaments();
    if (isAdmin) {
      void loadClubs();
    }
  }, [isAdmin, loadClubs, loadTournaments]);

  const resolvePickerBaseDate = useCallback(
    (target: DatePickerTarget) => {
      if (target === 'start') {
        return parseDateTimeInput(createStartDate, createStartTime) ?? new Date();
      }

      if (target === 'end') {
        return parseDateTimeInput(createEndDate, createEndTime) ?? new Date();
      }

      return parseDateTimeInput(createRegistrationDate, createRegistrationTime) ?? new Date();
    },
    [createEndDate, createEndTime, createRegistrationDate, createRegistrationTime, createStartDate, createStartTime],
  );

  const applyPickerValue = useCallback((state: DatePickerState, selectedDate: Date) => {
    if (state.target === 'start') {
      if (state.mode === 'date') {
        setCreateStartDate(formatDateInput(selectedDate));
      } else {
        setCreateStartTime(formatTimeInput(selectedDate));
      }
      return;
    }

    if (state.target === 'end') {
      if (state.mode === 'date') {
        setCreateEndDate(formatDateInput(selectedDate));
      } else {
        setCreateEndTime(formatTimeInput(selectedDate));
      }
      return;
    }

    if (state.mode === 'date') {
      setCreateRegistrationDate(formatDateInput(selectedDate));
    } else {
      setCreateRegistrationTime(formatTimeInput(selectedDate));
    }
  }, []);

  const handleDatePickerChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (!datePickerState) {
        return;
      }

      if (!selectedDate || event.type === 'dismissed') {
        setDatePickerState(null);
        return;
      }

      applyPickerValue(datePickerState, selectedDate);
      setDatePickerState(null);
    },
    [applyPickerValue, datePickerState],
  );

  const openDatePicker = useCallback((target: DatePickerTarget, mode: 'date' | 'time') => {
    Keyboard.dismiss();
    setDatePickerState({ target, mode });
  }, []);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <AppTopBar />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoiding}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={[Colors.primary, Colors.primaryContainer]}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.heroCard}
          >
            <View style={styles.heroGlow} />
            <Text style={styles.heroLabel}>Tournament Hub</Text>
            <Text style={styles.heroTitle}>Доступні турніри</Text>
            <Text style={styles.heroSubtitle}>Створюй події по клубах, керуй датами і дедлайном реєстрації.</Text>
          </LinearGradient>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Доступні турніри</Text>
            <Pressable onPress={handleRefresh} style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}>
              <Text style={styles.refreshButtonText}>Оновити</Text>
            </Pressable>
          </View>

          {isAdmin ? (
            <View style={styles.adminCard}>
              <Text style={styles.adminTitle}>Admin: створення турніру</Text>

              <View style={styles.adminFieldWrap}>
                <Text style={styles.adminLabel}>Назва турніру</Text>
                <TextInput
                  onChangeText={setCreateName}
                  placeholder="Весняний Кубок Padel"
                  placeholderTextColor={Colors.outline}
                  style={styles.adminInput}
                  value={createName}
                />
              </View>

              <View style={styles.adminFieldWrap}>
                <Text style={styles.adminLabel}>Опис</Text>
                <TextInput
                  multiline
                  numberOfLines={3}
                  onChangeText={setCreateDescription}
                  placeholder="Короткий регламент або опис турніру"
                  placeholderTextColor={Colors.outline}
                  style={[styles.adminInput, styles.adminTextarea]}
                  textAlignVertical="top"
                  value={createDescription}
                />
              </View>

              <View style={styles.adminFieldWrap}>
                <Text style={styles.adminLabel}>Клуб</Text>
                {clubsLoading ? (
                  <View style={styles.loadingLine}>
                    <ActivityIndicator color={Colors.primary} size="small" />
                    <Text style={styles.loadingText}>Завантажую клуби...</Text>
                  </View>
                ) : null}
                {clubsError ? <Text style={styles.adminError}>{clubsError}</Text> : null}

                {!clubsLoading && clubs.length === 0 ? (
                  <Text style={styles.adminHint}>Спочатку створи клуб в адмін-панелі профілю.</Text>
                ) : (
                  <>
                    <View style={styles.compactPickerTrigger}>
                      <Text numberOfLines={1} style={styles.compactPickerValue}>
                        {selectedClubLabel}
                      </Text>
                      <Pressable
                        onPress={() => {
                          setShowClubPicker((previous) => !previous);
                        }}
                        style={({ pressed }) => [styles.compactPickerButton, pressed && styles.pressed]}
                      >
                        <Text style={styles.compactPickerButtonText}>{showClubPicker ? 'Сховати' : 'Обрати'}</Text>
                      </Pressable>
                    </View>

                    {showClubPicker ? (
                      <View style={styles.pickerPanel}>
                        <TextInput
                          autoCapitalize="none"
                          onChangeText={setClubSearchInput}
                          placeholder="Пошук клубу"
                          placeholderTextColor={Colors.outline}
                          style={styles.pickerSearchInput}
                          value={clubSearchInput}
                        />

                        {visibleClubs.length === 0 ? (
                          <Text style={styles.mutedSmallText}>Клуби не знайдено</Text>
                        ) : (
                          visibleClubs.map((club) => {
                            const isActive = selectedClubId === club.id;
                            const clubLabel = [club.name, club.city].filter(Boolean).join(' · ');

                            return (
                              <Pressable
                                key={club.id}
                                onPress={() => {
                                  setSelectedClubId(club.id);
                                  setShowClubPicker(false);
                                }}
                                style={({ pressed }) => [
                                  styles.pickerOption,
                                  isActive && styles.pickerOptionActive,
                                  pressed && styles.pressed,
                                ]}
                              >
                                <Text style={[styles.pickerOptionText, isActive && styles.pickerOptionTextActive]}>
                                  {clubLabel}
                                </Text>
                                <Text
                                  style={[styles.pickerOptionMeta, isActive && styles.pickerOptionMetaActive]}
                                >
                                  Кортів: {club.courtsCount}
                                </Text>
                              </Pressable>
                            );
                          })
                        )}

                        {!clubSearchInput.trim() && clubs.length > 5 ? (
                          <Text style={styles.pickerHint}>Показано 5 із {clubs.length}</Text>
                        ) : null}
                      </View>
                    ) : null}
                  </>
                )}
              </View>

              <View style={styles.adminFieldWrap}>
                <Text style={styles.adminLabel}>Тип</Text>
                <View style={styles.compactPickerTrigger}>
                  <Text numberOfLines={1} style={styles.compactPickerValue}>
                    {createType}
                  </Text>
                  <Pressable
                    onPress={() => {
                      setShowTypePicker((previous) => !previous);
                    }}
                    style={({ pressed }) => [styles.compactPickerButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.compactPickerButtonText}>{showTypePicker ? 'Сховати' : 'Обрати'}</Text>
                  </Pressable>
                </View>

                {showTypePicker ? (
                  <View style={styles.pickerPanel}>
                    {(['AMERICANO', 'GROUP_STAGE', 'PLAYOFF'] as TournamentType[]).map((type) => {
                      const active = createType === type;
                      return (
                        <Pressable
                          key={type}
                          onPress={() => {
                            setCreateType(type);
                            setShowTypePicker(false);
                          }}
                          style={({ pressed }) => [
                            styles.pickerOption,
                            active && styles.pickerOptionActive,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={[styles.pickerOptionText, active && styles.pickerOptionTextActive]}>{type}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              <View style={styles.adminInlineGrid}>
                <View style={styles.adminInlineField}>
                  <Text style={styles.adminLabel}>Початок (дата)</Text>
                  <Pressable
                    onPress={() => {
                      openDatePicker('start', 'date');
                    }}
                    style={({ pressed }) => [styles.dateTimeButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.dateTimeButtonText}>{createStartDate}</Text>
                  </Pressable>
                </View>

                <View style={styles.adminInlineField}>
                  <Text style={styles.adminLabel}>Початок (час)</Text>
                  <Pressable
                    onPress={() => {
                      openDatePicker('start', 'time');
                    }}
                    style={({ pressed }) => [styles.dateTimeButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.dateTimeButtonText}>{createStartTime}</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.adminInlineGrid}>
                <View style={styles.adminInlineField}>
                  <Text style={styles.adminLabel}>Завершення (дата)</Text>
                  <Pressable
                    onPress={() => {
                      openDatePicker('end', 'date');
                    }}
                    style={({ pressed }) => [styles.dateTimeButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.dateTimeButtonText}>{createEndDate}</Text>
                  </Pressable>
                </View>

                <View style={styles.adminInlineField}>
                  <Text style={styles.adminLabel}>Завершення (час)</Text>
                  <Pressable
                    onPress={() => {
                      openDatePicker('end', 'time');
                    }}
                    style={({ pressed }) => [styles.dateTimeButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.dateTimeButtonText}>{createEndTime}</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.adminInlineGrid}>
                <View style={styles.adminInlineField}>
                  <Text style={styles.adminLabel}>Реєстрація до (дата)</Text>
                  <Pressable
                    onPress={() => {
                      openDatePicker('registration', 'date');
                    }}
                    style={({ pressed }) => [styles.dateTimeButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.dateTimeButtonText}>{createRegistrationDate}</Text>
                  </Pressable>
                </View>

                <View style={styles.adminInlineField}>
                  <Text style={styles.adminLabel}>Реєстрація до (час)</Text>
                  <Pressable
                    onPress={() => {
                      openDatePicker('registration', 'time');
                    }}
                    style={({ pressed }) => [styles.dateTimeButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.dateTimeButtonText}>{createRegistrationTime}</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.adminInlineGrid}>
                <View style={styles.adminInlineField}>
                  <Text style={styles.adminLabel}>Кількість гравців</Text>
                  <TextInput
                    keyboardType="number-pad"
                    onChangeText={setCreateMaxPlayers}
                    placeholder="16"
                    placeholderTextColor={Colors.outline}
                    style={styles.adminInput}
                    value={createMaxPlayers}
                  />
                </View>

                <View style={styles.adminInlineField}>
                  <Text style={styles.adminLabel}>Корти</Text>
                  <View style={styles.readonlyInfoBox}>
                    <Text style={styles.readonlyInfoText}>{selectedClub?.courtsCount ?? '-'} (із клубу)</Text>
                  </View>
                </View>
              </View>

              {createError ? <Text style={styles.adminError}>{createError}</Text> : null}
              {createSuccess ? <Text style={styles.adminSuccess}>{createSuccess}</Text> : null}

              <Pressable
                disabled={isCreating}
                onPress={() => {
                  void handleCreateTournament();
                }}
                style={({ pressed }) => [
                  styles.adminSubmit,
                  isCreating && styles.adminSubmitDisabled,
                  pressed && !isCreating && styles.pressed,
                ]}
              >
                {isCreating ? (
                  <ActivityIndicator color={Colors.onPrimary} size="small" />
                ) : (
                  <Text style={styles.adminSubmitText}>Створити турнір</Text>
                )}
              </Pressable>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loadingLine}>
              <ActivityIndicator color={Colors.primary} size="small" />
              <Text style={styles.loadingText}>Завантажую турніри...</Text>
            </View>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {!loading && !error && tournaments.length === 0 ? (
            <Text style={styles.emptyText}>Поки що немає опублікованих турнірів.</Text>
          ) : null}

          <View style={styles.tournamentList}>
            {tournaments.map((tournament) => {
              const registrationOpen = tournament.registrationStatus === 'OPEN';
              const location =
                [tournament.club?.name, tournament.club?.city]
                  .filter((part): part is string => Boolean(part))
                  .join(', ') ||
                tournament.location ||
                'Локацію не вказано';

              return (
                <Pressable
                  key={tournament.id}
                  onPress={() => {
                    navigation.navigate('TournamentDetails', {
                      tournamentId: tournament.id,
                      title: tournament.name,
                    });
                  }}
                  style={({ pressed }) => [styles.tournamentCard, pressed && styles.pressed]}
                >
                  <View style={styles.tournamentHead}>
                    <View style={styles.tournamentHeadLeft}>
                      <Text style={styles.tournamentName}>{tournament.name}</Text>
                      <Text style={styles.tournamentMeta}>{formatDateRange(tournament.startDate, tournament.endDate)}</Text>
                      <Text style={styles.tournamentMeta}>{location}</Text>
                      {registrationOpen && tournament.registrationCloseAt ? (
                        <Text style={styles.registrationDeadline}>Реєстрація до: {formatDateTime(tournament.registrationCloseAt)}</Text>
                      ) : null}
                    </View>
                    <View style={[styles.statusPill, registrationOpen ? styles.statusPillOpen : styles.statusPillClosed]}>
                      <Text style={styles.statusPillText}>{registrationOpen ? 'ВІДКРИТО' : 'ЗАКРИТО'}</Text>
                    </View>
                  </View>

                  <View style={styles.categoryList}>
                    {tournament.categories.map((category) => (
                      <View key={category.id} style={styles.categoryCard}>
                        <Text style={styles.categoryName}>{category.name}</Text>
                        <Text style={styles.categoryMeta}>{category.discipline} | {category.format}</Text>
                        <Text style={styles.categoryMeta}>Max: {category.maxParticipants}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.openHint}>Натисни, щоб відкрити</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {datePickerState ? (
          <DateTimePicker
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            is24Hour
            mode={datePickerState.mode}
            onChange={handleDatePickerChange}
            value={resolvePickerBaseDate(datePickerState.target)}
          />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  adminCard: {
    backgroundColor: Colors.surfaceLow,
    borderRadius: 18,
    gap: 10,
    marginBottom: 12,
    padding: 12,
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
  },
  adminError: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '700',
  },
  adminFieldWrap: {
    gap: 5,
  },
  adminHint: {
    color: Colors.outline,
    fontSize: 12,
    fontWeight: '600',
  },
  adminInlineField: {
    flex: 1,
    gap: 5,
  },
  adminInlineGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  adminInput: {
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    borderWidth: 0,
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    minHeight: 42,
    paddingHorizontal: 10,
  },
  adminTextarea: {
    minHeight: 82,
    paddingTop: 10,
  },
  adminLabel: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  adminSubmit: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 10,
  },
  adminSubmitDisabled: {
    opacity: 0.7,
  },
  adminSubmitText: {
    color: Colors.onPrimary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  adminSuccess: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  adminTitle: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  categoryCard: {
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 14,
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  categoryList: {
    gap: 8,
  },
  categoryMeta: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  categoryName: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '900',
  },
  content: {
    paddingBottom: 136,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  dateTimeButton: {
    alignItems: 'flex-start',
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    borderWidth: 0,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 10,
  },
  dateTimeButtonText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  compactPickerTrigger: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    borderWidth: 0,
    flexDirection: 'row',
    minHeight: 42,
    paddingHorizontal: 10,
  },
  compactPickerValue: {
    color: Colors.textPrimary,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    paddingRight: 8,
  },
  compactPickerButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: 10,
  },
  compactPickerButtonText: {
    color: Colors.onPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  pickerPanel: {
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    borderWidth: 0,
    gap: 6,
    marginTop: 6,
    padding: 8,
  },
  pickerSearchInput: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outlineVariant,
    borderRadius: 8,
    borderWidth: 0,
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    minHeight: 36,
    paddingHorizontal: 10,
  },
  pickerOption: {
    backgroundColor: Colors.surface,
    borderColor: Colors.outlineVariant,
    borderRadius: 8,
    borderWidth: 0,
    gap: 2,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pickerOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pickerOptionText: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
  },
  pickerOptionTextActive: {
    color: Colors.onPrimary,
  },
  pickerOptionMeta: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '700',
  },
  pickerOptionMetaActive: {
    color: Colors.onPrimaryContainer,
  },
  pickerHint: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '700',
  },
  mutedSmallText: {
    color: Colors.outline,
    fontSize: 11,
    fontWeight: '600',
  },
  clubPickerButton: {
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    minWidth: 150,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  clubPickerButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  clubPickerMeta: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '700',
  },
  clubPickerMetaActive: {
    color: Colors.onPrimaryContainer,
  },
  clubPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  clubPickerText: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
  },
  clubPickerTextActive: {
    color: Colors.onPrimary,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginBottom: 12,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
  },
  heroCard: {
    borderRadius: 26,
    marginBottom: 14,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
  },
  heroGlow: {
    backgroundColor: Colors.primaryContainer,
    borderRadius: 999,
    height: 190,
    opacity: 0.45,
    position: 'absolute',
    right: -60,
    top: -74,
    width: 190,
  },
  heroLabel: {
    color: Colors.onPrimaryContainer,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroSubtitle: {
    color: Colors.onPrimaryContainer,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    maxWidth: 330,
  },
  heroTitle: {
    color: Colors.onPrimary,
    fontSize: 34,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: -0.8,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  loadingLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  keyboardAvoiding: {
    flex: 1,
  },
  pressed: {
    opacity: 0.84,
  },
  readonlyInfoBox: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    borderWidth: 0,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 10,
  },
  readonlyInfoText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  registrationDeadline: {
    color: Colors.success,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  refreshButton: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 12,
  },
  refreshButtonText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  safeArea: {
    backgroundColor: Colors.surface,
    flex: 1,
  },
  sectionHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  statusPill: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 24,
    paddingHorizontal: 10,
  },
  statusPillClosed: {
    backgroundColor: Colors.outlineVariant,
  },
  statusPillOpen: {
    backgroundColor: 'rgba(0, 88, 82, 0.2)',
  },
  statusPillText: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  tournamentCard: {
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 18,
    gap: 10,
    padding: 12,
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
  },
  tournamentHead: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tournamentHeadLeft: {
    flex: 1,
    marginRight: 8,
  },
  tournamentList: {
    gap: 10,
  },
  tournamentMeta: {
    color: Colors.outline,
    fontSize: 11,
    fontWeight: '700',
  },
  tournamentName: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 2,
  },
  openHint: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  typePickerButton: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderColor: Colors.outlineVariant,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 10,
  },
  typePickerButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  typePickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  typePickerText: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  typePickerTextActive: {
    color: Colors.onPrimary,
  },
});
