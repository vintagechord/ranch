import SectionTitle from "@/app/components/SectionTitle";

const faqs = [
  {
    question: "환불이 가능한가요?",
    answer: "준비 상황에 따라 환불이 불가한 시점이 있겠습니다."
  },
  {
    question: "경매 물품은 꼭 가져와야 하나요?",
    answer: "필수는 아니지만 가져오면 훨씬 재밌을걸요. 1~3 만원 선의 저렴한 제품으로 가져오세요."
  },
  {
    question: "갯바람 운동회는 꼭 참여해야 하나요?",
    answer: "청팀/백팀으로 나눠 진행합니다. 현지 환경에 따라 종목을 선정합니다."
  },
  {
    question: "저녁은 뭘 먹나요?",
    answer: "선발대가 미리 장을 봐올 예정입니다.\n고기 및 기타 음식을 준비할 계획입니다."
  },
  {
    question: "창작 캠프에는 뭘 가져가나요?",
    answer: "아이디어, 데모, 레퍼런스 정도면 충분합니다. 해당 창작 아이디어를 상정하고 해당 프로젝트에 대한 이야기를 같이 나눕니다."
  }
];

export default function FAQ() {
  return (
    <section id="faq" className="page-section faq-section">
      <SectionTitle eyebrow="FAQ" title="미리 물어보자" />

      <div className="faq-list">
        {faqs.map((faq, index) => (
          <details key={faq.question} data-reveal-card open={index === 0}>
            <summary>{faq.question}</summary>
            <p>{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
