import SectionTitle from "@/app/components/SectionTitle";

export default function BankTransfer() {
  return (
    <section id="info" className="page-section bank-section">
      <SectionTitle
        eyebrow="BANK TRANSFER"
        title="알뜰살뜰 아껴쓰자"
      />

      <div className="bank-layout">
        <div className="bank-ticket" data-reveal-card>
          <span>은행</span>
          <strong>국민은행</strong>
        </div>
        <div className="bank-ticket" data-reveal-card>
          <span>계좌번호</span>
          <strong>036102-04-066096</strong>
        </div>
        <div className="bank-ticket" data-reveal-card>
          <span>예금주</span>
          <strong>정준영</strong>
        </div>
        <div className="bank-ticket is-fee" data-reveal-card>
          <div className="bank-ticket-heading">
            <span>참가비</span>
            <div className="bank-fee-info">
              <button
                type="button"
                className="bank-fee-info-button"
                aria-label="참가비 사용 예정 내역"
                aria-describedby="bank-fee-tooltip"
              >
                i
              </button>
              <div id="bank-fee-tooltip" className="bank-fee-tooltip" role="tooltip">
                <b>참가비 사용 예정</b>
                <p>100,000원은 모임에 필요한 공동 비용으로 사용됩니다.</p>
                <ul>
                  <li>펜션 대관비</li>
                  <li>식사 2회 및 주류</li>
                  <li>야식</li>
                  <li>기념품 제작비 등</li>
                </ul>
              </div>
            </div>
          </div>
          <strong>100,000원</strong>
        </div>
      </div>

    </section>
  );
}
