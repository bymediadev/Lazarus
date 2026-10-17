import { useMemo, useState } from "react";
import { guessMeetingZone, MEETING_ZONES, type MeetingZoneId } from "./slots";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function splitValue(value: string): { day: string; time: string } {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  if (!match) return { day: "", time: "" };
  return { day: match[1], time: match[2] };
}

function dayLabel(day: string): string {
  if (!day) return "Pick the day";
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const TIMES = Array.from({ length: (19 - 7) * 2 + 2 }, (_, index) => {
  const hour = 7 + Math.floor(index / 2);
  const minute = index % 2 === 0 ? 0 : 30;
  const value = `${pad(hour)}:${pad(minute)}`;
  const label = new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return { value, label };
});

function monthCells(year: number, month: number): Array<{ iso: string; day: number } | null> {
  const lead = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ iso: string; day: number } | null> = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= count; day += 1) {
    cells.push({ day, iso: `${year}-${pad(month + 1)}-${pad(day)}` });
  }
  return cells;
}

type Props = {
  value: string;
  zone: MeetingZoneId;
  onChange: (value: string) => void;
  onZoneChange: (zone: MeetingZoneId) => void;
};

/** Day, time, and time zone for their own team meeting. */
export default function TeamMeetingPicker({ value, zone, onChange, onZoneChange }: Props) {
  const parsed = splitValue(value);
  const start = parsed.day ? new Date(`${parsed.day}T12:00:00`) : new Date();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(parsed.day);
  const [time, setTime] = useState(parsed.time);
  const [year, setYear] = useState(start.getFullYear());
  const [month, setMonth] = useState(start.getMonth());
  const cells = useMemo(() => monthCells(year, month), [year, month]);
  const title = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const commit = (nextDay: string, nextTime: string) => {
    setDay(nextDay);
    setTime(nextTime);
    onChange(nextDay && nextTime ? `${nextDay}T${nextTime}` : "");
  };

  const shiftMonth = (step: number) => {
    const next = new Date(year, month + step, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  return (
    <div className="ohq-meet">
      <span>When does your team meet?</span>
      <label>
        <span>Your time zone</span>
        <select
          value={zone}
          onChange={(event) => onZoneChange(event.target.value as MeetingZoneId)}
        >
          {MEETING_ZONES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="ohq-option"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {dayLabel(day)}
      </button>
      {open && (
        <div className="ohq-month" role="dialog" aria-label="Pick the day">
          <div className="ohq-month-bar">
            <button type="button" onClick={() => shiftMonth(-1)}>
              Back
            </button>
            <strong>{title}</strong>
            <button type="button" onClick={() => shiftMonth(1)}>
              Next
            </button>
          </div>
          <div className="ohq-month-grid">
            {WEEKDAYS.map((name) => (
              <span key={name} className="ohq-month-name">
                {name}
              </span>
            ))}
            {cells.map((cell, index) =>
              cell ? (
                <button
                  key={cell.iso}
                  type="button"
                  className={cell.iso === day ? "is-selected" : undefined}
                  onClick={() => {
                    commit(cell.iso, time);
                    setOpen(false);
                  }}
                >
                  {cell.day}
                </button>
              ) : (
                <span key={`blank-${index}`} />
              )
            )}
          </div>
        </div>
      )}
      <label>
        <span>What time?</span>
        <select
          value={time}
          disabled={!day}
          onChange={(event) => commit(day, event.target.value)}
        >
          <option value="">{day ? "Pick a time" : "Pick the day first"}</option>
          {TIMES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export { guessMeetingZone };
