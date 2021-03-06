import {
  add,
  addDays,
  Duration,
  eachDayOfInterval,
  isAfter,
  isBefore,
  isSameDay,
  isWithinInterval,
  isValid,
  format,
  parse,
  subYears,
  startOfMonth,
  isSameMonth,
  addWeeks,
  addMonths,
} from 'date-fns';
import { throttle } from 'lodash';
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  TDaysOfWeek,
  THoveredDate,
  TMonth,
  TPotentialRange,
  TPickerMonthPadding,
} from './typings';
import {
  getDays,
  getNextActiveMonth,
  getPickerMonths,
  getWeekdayLabels,
  validateDates,
  refManager,
  TPickerMonth,
} from './useDatePicker.utils';

export enum ActiveSelection {
  start = 'start',
  end = 'end',
  none = 'none',
}

export interface OnDatesChangeProps {
  startDate: Date | null;
  endDate: Date | null;
}

export interface TDateRange {
  start?: Date;
  end?: Date;
}

export interface TCurrentInputValues {
  start: string;
  end: string;
}

export interface UseDatePickerProps {
  onDatesChange(data: OnDatesChangeProps): void;
  minDate?: Date | null;
  maxDate?: Date | null;
  startDate?: Date | null;
  endDate?: Date | null;
  numberOfMonths?: number;
  minDateRange?: Duration;
  maxDateRange?: Duration;
  fixRange?: Duration;
  firstDayOfWeek?: TDaysOfWeek;
  initialVisibleMonth?: Date;
  isDateBlocked?(date: Date): boolean;
  unavailableDates?: Date[] | ((date: Date) => boolean);
  getWeekDayLabel?: (dayIndex: TDaysOfWeek) => string;
  inputFormat?: string;
  padding?: TPickerMonthPadding;
}

export function useDatePicker({
  startDate = null,
  endDate = null,
  minDate = subYears(new Date(), 300),
  maxDate = null,
  onDatesChange,
  initialVisibleMonth,
  fixRange,
  minDateRange,
  maxDateRange,
  numberOfMonths = 2,
  firstDayOfWeek = 1,
  unavailableDates = [],
  getWeekDayLabel,
  inputFormat = 'dd/MM/yyyy',
  padding,
}: UseDatePickerProps) {
  const [activeMonths, setActiveMonths] = useState<TPickerMonth[]>([]);
  const [hoveredDate, setHoveredDate] = useState<THoveredDate>();
  const [focusedDate, setFocusedDate] = useState<Date>();
  const [activeSelection, setActiveSelection] = useState<ActiveSelection>(ActiveSelection.start);
  const [dateRange, setDateRage] = useState<TDateRange>({});
  const [currentInputValues, setCurrentInputValues] = useState<TCurrentInputValues>({
    start: '',
    end: '',
  });
  const [potentialRange, setPotentialRange] = useState<TPotentialRange>();
  const weekdayLabels = useMemo(() => getWeekdayLabels({ firstDayOfWeek, getWeekDayLabel }), [
    firstDayOfWeek,
    getWeekDayLabel,
  ]);
  const getInputRef = useMemo(() => refManager<HTMLInputElement, ActiveSelection>(), []);

  useEffect(() => {
    setActiveMonths(
      getPickerMonths({
        numberOfMonths,
        firstDayOfWeek,
        startDate: dateRange.start || initialVisibleMonth,
        endDate: dateRange.end,
        padding,
      }),
    );

    setCurrentInputValues(getInputValuesFromRange(dateRange));
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.addEventListener) {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
      }
    }

    return () => {
      if (window.removeEventListener) {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      }
    };
  });

  useEffect(() => {
    if (!focusedDate) return;

    const months = activeMonths.filter((m) => !m.isPadding);
    const leftBoundary = months[0].month.date;
    const rightBoundary = months[months.length - 1].month.date;

    if (focusedDate < leftBoundary) {
      setActiveMonths(getNextActiveMonth(activeMonths, -1, firstDayOfWeek, padding));
    }

    if (focusedDate > rightBoundary) {
      setActiveMonths(getNextActiveMonth(activeMonths, 1, firstDayOfWeek, padding));
    }

    if (activeSelection === ActiveSelection.start) {
      setCurrentInputValues(getInputValuesFromRange({ start: focusedDate }));
    }

    if (activeSelection === ActiveSelection.end) {
      setCurrentInputValues(getInputValuesFromRange({ end: focusedDate }));
    }
  }, [focusedDate]);

  useEffect(() => {
    getInputRef(activeSelection).current?.focus();
  }, [activeSelection, getInputRef]);

  useEffect(() => {
    calculatePotentialRange(hoveredDate?.date);
  }, [hoveredDate]);

  function getInputValuesFromRange(range: TDateRange): TCurrentInputValues {
    return {
      start: range.start ? format(range.start, inputFormat) : '',
      end: range.end ? format(range.end, inputFormat) : '',
    };
  }

  const isDisabled = (date: Date) => {
    if (typeof unavailableDates === 'function') {
      return unavailableDates(date);
    }

    return unavailableDates.some((d) => isSameDay(date, d));
  };

  const isWithinPotentialRange = (date: Date) => {
    return potentialRange && isWithinInterval(date, potentialRange.range);
  };

  const isStartDate = (date: Date) => {
    return !!dateRange.start && isSameDay(date, dateRange.start);
  };

  const isEndDate = (date: Date, endDate: Date | null) => {
    return !!dateRange.end && isSameDay(date, dateRange.end);
  };

  const isDateFocused = (date: Date) => (focusedDate ? isSameDay(date, focusedDate) : false);

  const handleKeyDown = useCallback(
    throttle(
      (e: KeyboardEvent) => {
        setFocusedDate((date) => {
          if (!date) {
            return activeMonths.filter((m) => !m.isPadding)[0]?.month?.date;
          }

          switch (e.key) {
            case 'ArrowRight':
              return addDays(date, 1);

            case 'ArrowLeft':
              return addDays(date, -1);

            case 'ArrowUp':
              return addWeeks(date, -1);

            case 'ArrowDown':
              return addWeeks(date, 1);

            case 'PageUp':
              return addMonths(date, -1);

            case 'PageDown':
              return addMonths(date, 1);

            default:
              break;
          }
        });
      },
      500,
      { leading: true },
    ),
    [activeMonths],
  );

  const handleKeyUp = () => {
    handleKeyDown.cancel();
  };

  const reset = () => {
    setDateRage({});
  };

  const onDateSelect = (range: TDateRange, sync = false) => {
    const isValid = validateDates({
      ...range,
      isDisabled,
      minDate,
      maxDate,
      minDateRange,
      maxDateRange,
    });

    if (isValid) {
      setDateRage(range);

      onDatesChange?.({
        startDate: range.start ?? null,
        endDate: range.end ?? null,
      });

      // check if selected start date is within view
      const isStartDateVisible =
        !!range.start && activeMonths.some((month) => isSameMonth(month.month.date, range.start!));

      // check if selected end date is within view
      const isEndDateVisible =
        !!range.end && activeMonths.some((month) => isSameMonth(month.month.date, range.end!));

      // only recompute active months when selected date isn't in view
      if (
        (!isStartDateVisible && activeSelection === ActiveSelection.start) ||
        (!isEndDateVisible && activeSelection === ActiveSelection.end)
      ) {
        setActiveMonths(
          getPickerMonths({
            numberOfMonths,
            firstDayOfWeek,
            startDate: range.start || initialVisibleMonth,
            endDate: range.end,
            padding,
          }),
        );
      }

      if (sync) setCurrentInputValues(getInputValuesFromRange(range));

      if (activeSelection === ActiveSelection.end && range.start) {
        setActiveSelection(ActiveSelection.none);
      } else {
        setActiveSelection(ActiveSelection.end);
      }
    }
  };

  const calculatePotentialRange = (date?: Date) => {
    if (!date) {
      setPotentialRange(undefined);
      return;
    }

    const { start: startDate, end: endDate } = dateRange;

    if ((!startDate && !endDate) || activeSelection === ActiveSelection.none) {
      setPotentialRange(undefined);

      return;
    }

    let range: Interval | null = null;

    if (activeSelection === ActiveSelection.end && startDate && startDate < date) {
      range = { start: startDate, end: date };
    }

    if (activeSelection === ActiveSelection.start && endDate && endDate > date) {
      range = { start: date, end: endDate };
    }

    if (!range) {
      setPotentialRange(undefined);

      return;
    }

    let validationError = '';

    // violates minimum range constraint
    if (minDateRange && !isAfter(range.end, add(range.start, minDateRange))) {
      validationError = 'LESS_THAN_MIN_RANGE';
    }

    // violate maximum range constraint
    if (!validationError && maxDateRange && isAfter(range.end, add(range.start, maxDateRange))) {
      validationError = 'GREATER_THAN_MAX_RANGE';
    }

    // contains blocked dates
    if (!validationError && !eachDayOfInterval(range).some((d) => isDisabled(d))) {
      validationError = 'CONTAINS_BLOCKED_DATE';
    }

    setPotentialRange({
      range,
      error: validationError ? { reason: validationError } : null,
    });
  };

  const onDateHover = (date: Date) => {
    let validationError = '';
    const { start: startDate, end: endDate } = dateRange;

    // blocked date
    if (isDisabled(date)) {
      validationError = 'BLOCKED_DATE';
    }

    // less than minimum date
    if (minDate && isBefore(date, addDays(minDate, -1))) {
      validationError = 'LESS_THAN_MIN_DATE';
    }

    // greater than max date
    if (!validationError && maxDate && isAfter(date, maxDate)) {
      validationError = 'GREATER_THAN_MAX_DATE';
    }

    // fixed range
    if (!validationError && fixRange) {
      const hasError =
        (startDate && isAfter(date, add(startDate, fixRange))) ||
        (endDate && isAfter(date, add(endDate, fixRange)));

      if (hasError) {
        validationError = 'VIOLATES_FIX_RANGE';
      }
    }

    setHoveredDate({
      date,
      error: validationError ? { reason: validationError } : null,
    });
  };

  const movePickerBy = (vector: number) => {
    setActiveMonths(getNextActiveMonth(activeMonths, vector, firstDayOfWeek, padding));
  };

  const goToDate = (date: Date) => {
    setActiveMonths(getPickerMonths({ numberOfMonths, firstDayOfWeek, startDate: date }));
    setFocusedDate(undefined);
  };

  const goToYear = (year: number) => {};

  const getDateProps = (date: Date) => {
    const disabled = isDisabled(date);
    const focused = !!focusedDate && isSameDay(date, focusedDate);

    const onDateClick = (date: Date) => {
      if (activeSelection === ActiveSelection.start) {
        onDateSelect({ ...dateRange, start: date }, true);
      } else if (activeSelection === ActiveSelection.end) {
        onDateSelect({ ...dateRange, end: date }, true);
      } else {
        setActiveSelection(ActiveSelection.start);
        onDateSelect({ start: date }, true);
      }
    };

    return {
      props: {
        onClick: () => onDateClick(date),
        onMouseEnter: () => onDateHover(date),
        onMouseLeave: () => setHoveredDate(undefined),
        disabled,
        tabIndex: focusedDate === date ? 0 : -1,
      },
      disabled,
      isInSelectedRange:
        dateRange.start &&
        dateRange.end &&
        isWithinInterval(date, { start: dateRange.start!, end: dateRange.end! }),
      potentialRange: {
        isWithinRange: isWithinPotentialRange(date),
        error: potentialRange?.error ?? null,
      },
      isStartDate: dateRange.start && isSameDay(dateRange.start, date),
      isEndDate: dateRange.end && isSameDay(dateRange.end, date),
      focused,
    };
  };

  const getInputProps = (type: ActiveSelection) => {
    const onClick = () => {
      setActiveSelection(type);
    };

    const onFocus = () => onClick();

    const onBlur = () => {
      // setActiveSelection(ActiveSelection.none);

      setCurrentInputValues(getInputValuesFromRange(dateRange));
    };

    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setCurrentInputValues({
        start: type === ActiveSelection.start ? e.target.value : currentInputValues.start,
        end: type === ActiveSelection.end ? e.target.value : currentInputValues.end,
      });

      const date = parse(e.target.value, inputFormat, new Date());

      if (!isValid(date)) return;

      if (type === ActiveSelection.start) {
        onDateSelect({ ...dateRange, start: date });
      } else {
        onDateSelect({ ...dateRange, end: date });
      }
    };

    const value =
      type === ActiveSelection.start ? currentInputValues.start : currentInputValues.end;

    return {
      onClick,
      onFocus,
      onChange,
      onBlur,
      value,
      ref: getInputRef(type),
    };
  };

  return {
    firstDayOfWeek,
    activeMonths,
    isStartDate,
    isEndDate,
    numberOfMonths,
    isDateFocused,
    focusedDate,
    hoveredDate,
    onResetDates: reset,
    onDateHover,
    onDateSelect,
    goToDate,
    weekdayLabels,
    getDateProps,
    getInputProps,
    activeSelection,
    movePickerBy,
  };
}
