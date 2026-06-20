import SectionTitle from "@/app/components/SectionTitle";

const programs = [
  {
    title: "창작 캠프",
    description:
      "아이디어나 준비 중인 프로젝트를 소개하고, 같이 할 사람을 찾아봅니다."
  },
  {
    title: "시네마 음주회",
    description: "영화를 틀어놓고 술이나 물이나 음료를 마시는 시간입니다."
  },
  {
    title: "갯바람 운동회",
    description: "청팀/백팀으로 나눠 진행합니다. 땀이 절대 나지 않도록 합니다."
  },
  {
    title: "경매 을왕리 에디션",
    description: "각자 가져온 물건을 을왕리 경매대에 올립니다. 고가의 제품은 절대 사양합니다."
  }
];

export default function ProgramSection() {
  return (
    <section id="program" className="page-section program-section">
      <SectionTitle eyebrow="PROGRAM" title="프로그램" />

      <div className="program-grid">
        {programs.map((program, index) => (
          <article key={program.title} className="program-card" data-program-card>
            <span className="program-number">{String(index + 1).padStart(2, "0")}</span>
            <h3>{program.title}</h3>
            <p>{program.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
