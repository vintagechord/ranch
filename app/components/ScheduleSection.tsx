import SectionTitle from "@/app/components/SectionTitle";

const scheduleGroups = [
  {
    id: "day-1",
    day: "1일차 · 7월 17일",
    items: [
      { time: "15:00", label: "체크인 / 짐 풀기" },
      {
        time: "16:00-18:00",
        label: "갯바람 운동회",
        duration: "총 2시간",
        note:
          "청팀/백팀으로 나눠 진행합니다.\n현지 환경에 따라 종목을 선정합니다."
      },
      {
        time: "18:00-19:30",
        label: "해변 산책",
        duration: "총 1시간 30분",
        note: "해변 이동 차량 지원"
      },
      { time: "19:30-21:30", label: "저녁 식사", duration: "총 2시간" },
      {
        time: "21:30-22:30",
        label: "을왕리 옥션",
        duration: "총 1시간",
        note:
          "필수는 아니지만 가져오면 훨씬 재밌을걸요.\n1~3 만원 선의 저렴한 제품으로 가져오세요."
      },
      { time: "22:30-23:00", label: "쉬는 시간 / 자유 정리" },
      { time: "23:00-01:00", label: "시네마 음주회", duration: "총 2시간" },
      { time: "01:00-", label: "자유 시간" }
    ]
  },
  {
    id: "day-2",
    day: "2일차 · 7월 18일",
    items: [
      { time: "08:00", label: "기상" },
      { time: "08:30-09:30", label: "체조 및 명상", duration: "총 1시간" },
      { time: "09:30-11:00", label: "아침 식사", duration: "총 1시간 30분" },
      { time: "11:00", label: "럭키 드로우 / 해산" }
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
                      {item.duration ? <span className="schedule-duration">{item.duration}</span> : null}
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
