# 场景数据来源

本目录测试数据来自开源项目 [marlonlu/futu_tax_calculator](https://github.com/marlonlu/futu_tax_calculator)
的 test_data 场景集 (基于真实富途账单整理的交易场景与预期已实现盈亏)。

- `test_data.csv` — 交易输入 (股票代码/数量/成交价格/买卖方向/结算币种/合计手续费/交易时间)
- `test_data_YYYY.csv` — 该年度预期已实现盈亏输出

仅用于解析器/计算引擎的回归验证。
