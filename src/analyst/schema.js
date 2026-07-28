/**
 * 모델이 AnalystResult 형태(picks 배열 등)를 구조적으로 반환하도록 강제하기 위한
 * Gemini 응답 스키마. generateContent 호출 시 config.responseSchema +
 * config.responseMimeType: 'application/json'으로 넘겨서, 자유 텍스트 파싱 실패
 * 위험 없이 이 스키마에 맞는 JSON만 반환하도록 강제한다.
 *
 * 2026-07-28: 원래 Anthropic의 tool_choice 강제 방식(tool.js)이었으나, Gemini API로
 * 전환하면서 Gemini의 responseSchema 구조화 출력 방식으로 대체.
 */
import { Type } from '@google/genai';

export const RATING_VALUES = ['매수 고려', '관망', '주의'];
export const CONFIDENCE_VALUES = ['강함', '중간', '약함'];

export const ANALYSIS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    headline: {
      type: Type.STRING,
      description:
        '오늘 시장을 한 문장으로 요약하는 총평. 특정 종목명을 나열하지 말고, 시장/섹터 관점의 ' +
        '짧은 총평으로 작성할 것. 20~30자 내외로 짧게 (예: "AI 관련주 중심 관심, 반도체는 조정 ' +
        '국면"). 상세 근거는 shortTermOutlook 등 다른 필드에서 다루므로 여기서는 결론만 짧게.',
    },
    shortTermOutlook: {
      type: Type.STRING,
      description:
        '단기(1일~1개월) 시장 전망. 뉴스에 등장한 구체적 수치/출처/날짜를 인용한 근거를 ' +
        '먼저 제시하고, 예상 수익률 범위(예: "-3%~+2%")와 그렇게 판단한 근거를 함께 서술. ' +
        '리스크 요인도 반드시 함께 언급. 예상 수익률 범위나 핵심 결론처럼 가장 중요한 부분은 ' +
        '**이렇게** 두 개의 별표로 감싸서 짧게 강조 표시할 것.',
    },
    longTermOutlook: {
      type: Type.STRING,
      description:
        '장기(6개월~1년 이상) 시장 전망. 뉴스에 등장한 구체적 수치/출처/날짜를 인용한 근거를 ' +
        '먼저 제시하고, 예상 수익률 범위와 그렇게 판단한 근거를 함께 서술. ' +
        '거시경제/실적 불확실성/밸류에이션 부담 등 리스크 요인도 반드시 함께 언급. ' +
        '예상 수익률 범위나 핵심 결론처럼 가장 중요한 부분은 **이렇게** 두 개의 별표로 감싸서 ' +
        '짧게 강조 표시할 것.',
    },
    picks: {
      type: Type.ARRAY,
      description:
        '개별 종목/자산에 대한 분석 목록. "매수 고려"/"관망"/"주의" 각 등급별 개수는 고정되어 ' +
        '있지 않음 — 등급별로 0~3개 사이에서 그날 뉴스 근거의 양/질에 맞춰 유연하게 결정할 것. ' +
        '근거 없는 추측성 종목 추천은 피할 것. 잘 알려지지 않은 소형/동전주는 굳이 포함하지 말고, ' +
        '가급적 이름을 들으면 알 만한 잘 알려진 기업 위주로 선정할 것(특히 "주의" 등급은 ' +
        '"잘 알려졌지만 지금은 위험 요인이 있는 기업" 위주가 유용함).',
      items: {
        type: Type.OBJECT,
        properties: {
          ticker: {
            type: Type.STRING,
            description: '종목 코드 또는 티커 (모르면 빈 문자열 대신 회사명을 기반으로 추정 표기)',
          },
          name: { type: Type.STRING, description: '종목/회사명' },
          rating: {
            type: Type.STRING,
            enum: RATING_VALUES,
            description: '투자 판단. 반드시 이 세 값 중 하나: 매수 고려 | 관망 | 주의',
          },
          rationale: {
            type: Type.STRING,
            description:
              '근거. 결론보다 근거를 우선해서 서술하되, 뉴스의 구체적 수치/출처/날짜를 ' +
              '인용할 것. 인용할 구체적 수치가 없으면 "구체적 수치 없음"이라고 명시.',
          },
          risk: {
            type: Type.STRING,
            description:
              '리스크 요인. 거시경제 변수, 실적 불확실성, 밸류에이션 부담 등 ' +
              '긍정적 시나리오와 상반되는 요인을 반드시 병기.',
          },
          confidence: {
            type: Type.STRING,
            enum: CONFIDENCE_VALUES,
            description:
              '확신도. 데이터/수치 기반 발언이면 강함, 정황상 추정이면 중간, ' +
              '추측성 발언이면 약함. 반드시 이 세 값 중 하나: 강함 | 중간 | 약함',
          },
          positionGuidance: {
            type: Type.STRING,
            description:
              '이 종목에 대한 일반적인 리스크관리 원칙(포지션 비중 %, 손절선 % 등)을 ' +
              'rating/confidence에 맞춰 서술. 확신도가 강하고 매수 고려일수록 상대적으로 ' +
              '적극적으로(예: "총자산의 5~10% 이내 분할 매수, 매수가 대비 -8~10% 손절선 권장"), ' +
              '확신도가 약하거나 주의 등급일수록 보수적으로(예: "신규 진입 자제, 보유 중이면 ' +
              '비중 축소 검토") 서술. 특정 금액이나 개인 자산 규모를 가정하지 말고 %/일반 원칙 ' +
              '기준으로만 서술하며, "일반적인 원칙이며 개인 자산 상황에 따라 조정이 필요하다"는 ' +
              '취지를 반드시 포함할 것.',
          },
        },
        required: ['ticker', 'name', 'rating', 'rationale', 'risk', 'confidence', 'positionGuidance'],
      },
    },
    disclaimer: {
      type: Type.STRING,
      description: '면책 문구. "투자 자문이 아니며 참고용"이라는 취지의 문구를 반드시 포함할 것.',
    },
  },
  required: ['headline', 'shortTermOutlook', 'longTermOutlook', 'picks', 'disclaimer'],
};
