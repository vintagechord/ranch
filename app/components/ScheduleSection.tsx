import SectionTitle from "@/app/components/SectionTitle";

const scheduleGroups = [
  {
    id: "day-1",
    day: "1일차 · 7월 17일",
    items: [
      { time: "15:00", label: "체크인 / 짐 풀기" },
      {
        time: "16:00",
        label: "갯바람 운동회",
        note:
          "팀별로 나눠서 1:1 또는 2:2의 대결을 개최하여 총점 계산합니다.\n위험하거나 더워지는 운동은 지양합니다."
      },
      { time: "17:30", label: "해변 산책 / 자유시간", note: "해변 이동 차량 지원" },
      { time: "18:30", label: "저녁 식사" },
      {
        time: "20:00",
        label: "창작 캠프",
        note: "올해 목표하는 창작 아이디어나 작업하고 있는 아이템을 소개하고, 필요하면 동료를 찾습니다."
      },
      { time: "21:30", label: "경매 을왕리 에디션" },
      { time: "22:30", label: "자유시간" },
      { time: "23:30-02:00", label: "시네마 음주회" },
      { time: "02:00", label: "자유 시간" }
    ]
  },
  {
    id: "day-2",
    day: "2일차 · 7월 18일",
    items: [
      { time: "08:30", label: "기상" },
      { time: "09:00", label: "체조 및 명상" },
      { time: "09:30", label: "아침 식사" },
      { time: "10:30", label: "기념품 증정" },
      { time: "11:00", label: "해산" }
    ]
  }
];

export default function ScheduleSection() {
  return (
    <section id="schedule" className="page-section schedule-section">
      <SectionTitle eyebrow="SCHEDULE" title="모든 일정 자유 참여" />

      <div className="schedule-groups">
        {scheduleGroups.map((group) => (
          <section key={group.id} className="schedule-day" aria-labelledby={`schedule-${group.id}`}>
            <h3 id={`schedule-${group.id}`}>{group.day}</h3>
            <ol className="schedule-list" aria-label={`${group.day} 일정`}>
              {group.items.map((item, index) => {
                const noteId = `schedule-note-${group.day}-${index}`;

                return (
                <li key={`${item.time}-${item.label}`} data-schedule-row>
                  <time>{item.time}</time>
                  <div className={`schedule-main${item.note ? " has-note" : ""}`}>
                    <span className="schedule-title">{item.label}</span>
                    {item.note ? (
                      <span className="schedule-info">
                        <button
                          type="button"
                          className="schedule-info-button"
                          aria-label={`${item.label} 안내`}
                          aria-describedby={noteId}
                        >
                          i
                        </button>
                        <span id={noteId} className="schedule-tooltip" role="tooltip">
                          {item.note}
                        </span>
                      </span>
                    ) : null}
                  </div>
                </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </section>
  );
}
