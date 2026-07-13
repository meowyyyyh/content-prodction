import { Document, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, WidthType, AlignmentType, Packer } from 'docx';
import { writeFileSync } from 'fs';

const B = (text) => new TextRun({ text, bold: true });
const N = (text) => new TextRun({ text });

// ── 示例篇 ──
function buildExampleDoc() {
  const children = [];

  children.push(new Paragraph({
    spacing: { after: 120 },
    children: [B('商品名：'), N('认养一头牛每日吨吨木姜子香茅酸奶')],
  }));
  children.push(new Paragraph({
    spacing: { after: 120 },
    children: [B('原文链接：'), N('https://...')],
  }));

  // 数据表格
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      row(['', '点赞数', '评论数', '订单/转化'], true),
      row(['数据', '2300', '156', '180']),
    ],
  }));
  children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));

  children.push(new Paragraph({
    spacing: { after: 200 },
    children: [B('风格：'), N('小红书种草')],
  }));

  const modules = [
    ['首屏钩子', '🌱云贵山野入瓶！木姜子香茅酸奶，给你舌尖上的云贵之旅~\n认养一头牛【每日吨吨】益生菌酸奶·木姜子香茅风味！新品首发！79.9元12瓶再送3瓶，到手整整15瓶！'],
    ['价格福利', '💰 团购价：79.9元/12瓶，再送3瓶！算下来单瓶不到5.3元！超市同款单瓶8.5元，直接省出一顿饭钱！'],
    ['口感体验', '打开就能闻到浓郁的奶香，带一丝木姜子的清香。\n入口丝滑得像丝绸划过舌尖，酸度恰到好处，不会酸到皱眉。\n回味有淡淡的奶甜，完全没有香精味。\n质地介于流动型和凝固型之间，用勺子舀起来能拉出小尖角。'],
    ['基础信任', '真正的清洁配方！配料：生牛乳（≥80%）、木姜子香茅酱、白砂糖、益生菌。无香精、无色素、无防腐剂。成分党也能放心饮用！'],
    ['物流售后', '🚄 顺丰冷链，上海仓发货，48小时内发出。泡沫箱+冰袋包装。质量问题24小时内凭照片赔付。'],
    ['储存贴士', '📌 0-4℃冷藏保存，保质期6个月。开盖后4小时内喝完，喝前摇一摇。建议3岁以上饮用。'],
    ['行动召唤', '79.9元就能买到15瓶，还包邮到家！这个价格真的不买就亏了。链接放评论区了，直接冲👇'],
    ['成分科普', ''],
    ['原料溯源', '🌍 奶源来自北纬40°黄金奶源带，高海拔大温差，奶牛自然放牧。木姜子来自云贵山区野生采集。'],
    ['品牌背书', '认养一头牛，专注益生菌酸奶。SGS权威质检，通过200+项检测。'],
    ['场景共情', '🥘 火锅解腻好搭子！吃完火锅来一瓶，瞬间清爽。\n💻 办公室下午茶必备！午后犯困来一瓶，提神又健康。\n🍽 早餐配面包，营养又方便。'],
    ['用户反馈', ''],
    ['全网比价', '💰 全网比价：淘宝 ¥8.5/瓶，京东 ¥7.9/瓶，拼多多 ¥7.5/瓶。团购价：¥5.3/瓶！'],
    ['常见问题', ''],
  ];
  for (const [label, content] of modules) {
    children.push(new Paragraph({
      spacing: { after: 160 },
      children: [B(label + '：'), N(content || '')],
    }));
  }

  const images = [
    ['1', '酸奶从勺子上拉丝特写，白色奶液倾倒下', '口感体验', '第 1 张', 'IMG_20240709_143021.jpg'],
    ['2', '酸奶倒入玻璃杯的过程，展示浓稠质地', '口感体验', '第 2 张', 'IMG_20240709_143122.jpg'],
    ['3', '办公桌下午茶场景，酸奶旁边放了一本书', '场景共情', '第 1 张', 'IMG_20240709_143215.jpg'],
    ['4', '顺丰冷链包装箱特写，泡沫箱+冰袋', '物流售后', '第 1 张', 'IMG_20240709_143308.jpg'],
  ];
  for (const [num, desc, mod, pos, file] of images) {
    children.push(new Paragraph({
      spacing: { after: 80 },
      children: [
        B(`图片 ${num}：`), N(desc),
        N(`\n        → 「${mod}」模块，${pos}`),
        N(`\n        → ${file}`),
      ],
    }));
  }

  return new Document({ sections: [{ children }] });
}

// ── 空白篇 ──
function buildBlankDoc() {
  const children = [];

  children.push(new Paragraph({
    spacing: { after: 120 },
    children: [B('商品名：')],
  }));
  children.push(new Paragraph({
    spacing: { after: 120 },
    children: [B('原文链接：')],
  }));

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      row(['', '点赞数', '评论数', '订单/转化'], true),
      row(['数据', '', '', '']),
    ],
  }));
  children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));

  children.push(new Paragraph({
    spacing: { after: 200 },
    children: [B('风格：')],
  }));

  const labels = [
    '首屏钩子', '价格福利', '口感体验', '基础信任', '物流售后',
    '储存贴士', '行动召唤', '成分科普', '原料溯源', '品牌背书',
    '场景共情', '用户反馈', '全网比价', '常见问题',
  ];
  for (const label of labels) {
    children.push(new Paragraph({
      spacing: { after: 160 },
      children: [B(label + '：')],
    }));
  }

  for (let i = 1; i <= 3; i++) {
    children.push(new Paragraph({
      spacing: { after: 80 },
      children: [
        B(`图片 ${i}：`), N('（描述）'),
        N(`\n        → 「」模块，第  张`),
        N('\n        → '),
      ],
    }));
  }

  return new Document({ sections: [{ children }] });
}

function row(cells, isHeader = false) {
  return new TableRow({
    children: cells.map(cell => new TableCell({
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: cell, bold: isHeader })],
      })],
      width: { size: 25, type: WidthType.PERCENTAGE },
    })),
  });
}

const docsDir = '/Users/meowyh/Desktop/Claude CODE/content production/app/docs';

async function main() {
  const exampleBuf = await Packer.toBuffer(buildExampleDoc());
  writeFileSync(`${docsDir}/语料收集模板-示例篇.docx`, exampleBuf);

  const blankBuf = await Packer.toBuffer(buildBlankDoc());
  writeFileSync(`${docsDir}/语料收集模板-空白篇.docx`, blankBuf);

  console.log('✅ 已重新生成两个 Word 文档');
}

main();
