import SectionTitle from "@/app/components/SectionTitle";

const faqs = [
  {
    question: "환불이 가능한가요?",
    answer: "준비 상황에 따라 환불 가능 기간을 별도 안내합니다."
  },
  {
    question: "경매 물품은 꼭 가져와야 하나요?",
    answer: "필수는 아니지만 가져오면 훨씬 재미있습니다. 고가의 제품은 절대 사양합니다."
  },
  {
    question: "갯바람 운동회는 꼭 참여해야 하나요?",
    answer: "청팀/백팀으로 나눠 진행합니다. 가만히 구경만 해도 좋습니다."
  },
  {
    question: "저녁은 뭘 먹나요?",
    answer: "아마도 고기 구워먹을 것 같아요."
  },
  {
    question: "창작 캠프에는 뭘 가져가나요?",
    answer: "아이디어, 데모, 레퍼런스 정도면 충분합니다. 완성된 프로젝트가 아니어도 됩니다."
  }
];

export default function FAQ() {
  return (
    <section id="faq" className="page-section faq-section">
      <SectionTitle eyebrow="FAQ" title="물어볼 법한 것들" />

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
