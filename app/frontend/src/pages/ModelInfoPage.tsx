import React, { useEffect, useState } from 'react';
import { fetchModelInfo } from '../services/api';
import { DataSourceInfo } from '../types';
import { useText } from '../platform/store';
import { TechDocsModal } from '../components/common/TechDocsModal';

/* Scores come from the locked test run: metrics/final_test_results.csv in the model repo. */
export const ModelInfoPage: React.FC = () => {
  const { L } = useText();
  const [sources, setSources] = useState<DataSourceInfo[]>([]);
  const [docsOpen, setDocsOpen] = useState(false);

  useEffect(() => {
    fetchModelInfo().then((i) => setSources(i.data_sources)).catch(() => setSources([]));
  }, []);

  const steps = [
    {
      title: L('Read the weather', 'मौसम पढ़ना'),
      body: L('Each gauge gets 94 days of rain and temperature, plus 16 traits of its catchment such as slope, soil and dams. It never uses a river gauge reading as input.', 'हर गेज को 94 दिनों की बारिश और तापमान तथा जलग्रहण क्षेत्र की 16 विशेषताएँ मिलती हैं। इनपुट में नदी के गेज का माप कभी नहीं होता।'),
    },
    {
      title: L('Learn each river\'s memory', 'हर नदी की स्मृति सीखना'),
      body: L('A Mamba block reads that sequence with weights shared across gauges. It scales linearly with sequence length, where attention scales quadratically.', 'एक Mamba ब्लॉक सभी गेज के लिए साझा वज़न से इस क्रम को पढ़ता है। यह क्रम की लंबाई के साथ रैखिक रूप से बढ़ता है।'),
    },
    {
      title: L('Follow the water downstream', 'पानी को नीचे की ओर ट्रैक करना'),
      body: L('A graph layer passes information along 44 real river links, so a gauge knows what is coming from upstream.', 'एक ग्राफ़ परत 44 नदी लिंक के साथ जानकारी भेजती है, ताकि गेज को पता रहे कि ऊपर से क्या आ रहा है।'),
    },
    {
      title: L('Forecast four days', 'चार दिन का पूर्वानुमान'),
      body: L('Flow is predicted for days 1 to 4. Three seeds are averaged, and flood days weigh more in training so they aren\'t drowned out by ordinary days.', 'दिन 1 से 4 का प्रवाह अनुमानित होता है। तीन सीड का औसत लिया जाता है और प्रशिक्षण में बाढ़ वाले दिनों को अधिक महत्व मिलता है।'),
    },
    {
      title: L('Correct the errors (tested, switched off)', 'त्रुटियाँ सुधारना (जाँचा गया, बंद)'),
      body: L('XGBoost learned from the forecaster\'s mistakes. On 2012 it cut false alarms but caught about 100 fewer flood days at each lead, so it stays off for flood warning.', 'XGBoost ने मॉडल की अपनी गलतियों से सीखा। 2012 पर इसने गलत अलर्ट घटाए, पर हर लीड पर लगभग 100 कम बाढ़ दिन पकड़े, इसलिए बाढ़ चेतावनी के लिए यह बंद है।'),
    },
  ];

  const facts = [
    { value: '46', label: L('gauges across two basins', 'दो बेसिन में गेज') },
    { value: '~74%', label: L('of flood days caught at lead days 2 to 4', 'लीड दिन 2 से 4 पर पकड़े गए बाढ़ दिन') },
    { value: '~38%', label: L('of alerts were false', 'अलर्ट गलत निकले') },
    { value: '0.62', label: L('median NSE, the standard flow accuracy score', 'माध्य NSE, प्रवाह सटीकता का मानक') },
  ];

  return (
    <main className="pf-page">
      <div className="pf-page-head">
        <div>
          <h1>{L('A forecast that starts with the sky', 'आसमान से शुरू होने वाला पूर्वानुमान')}</h1>
          <p className="pf-sub pf-lede">
            {L('STG-Mamba forecasts river flow at 46 gauges on the Godavari and Mahanadi for the next four days, using weather and the shape of the river network.', 'STG-Mamba गोदावरी और महानदी के 46 गेज पर अगले चार दिनों का नदी प्रवाह मौसम और नदी नेटवर्क की बनावट से बताता है।')}
          </p>
        </div>
      </div>

      <section className="pf-facts">
        {facts.map((f) => (
          <div key={f.value}><b>{f.value}</b><span>{f.label}</span></div>
        ))}
      </section>
      <p className="pf-note">
        {L('Scored once on held-back test years 2013 to 2018, using recorded rain for the four forecast days, so real forecast rain will score lower. For comparison, a seasonal-average baseline at lead day 2 caught about 30% of flood days with 81% of its alerts false, and a median NSE of 0.13.', 'रोके गए टेस्ट वर्ष 2013 से 2018 पर एक बार जाँचा गया, चार पूर्वानुमान दिनों की दर्ज बारिश के साथ, इसलिए असली पूर्वानुमान वर्षा पर स्कोर कम होगा। तुलना के लिए, लीड दिन 2 पर मौसमी औसत आधाररेखा ने लगभग 30% बाढ़ दिन पकड़े, 81% अलर्ट गलत रहे और माध्य NSE 0.13 रहा।')}
      </p>

      <section className="pf-steps">
        <h2>{L('How a forecast is made', 'पूर्वानुमान कैसे बनता है')}</h2>
        <ol>
          {steps.map((s, i) => (
            <li key={i}>
              <span className="pf-step-no">{i + 1}</span>
              <div><h3>{s.title}</h3><p>{s.body}</p></div>
            </li>
          ))}
        </ol>
      </section>

      {sources.length > 0 && (
        <section className="pf-sources">
          <h2>{L('Open data it stands on', 'जिस खुले डेटा पर यह आधारित है')}</h2>
          <ul>
            {sources.map((s) => (
              <li key={s.name}><b>{s.name}</b><span>{s.role}</span><small>{s.citation}</small></li>
            ))}
          </ul>
        </section>
      )}

      <div className="pf-row pf-foot-actions">
        <button type="button" className="pf-btn" onClick={() => setDocsOpen(true)}>{L('Read the technical notes', 'तकनीकी नोट पढ़ें')}</button>
      </div>
      <p className="pf-note">
        {L('Research prototype, not a warning service. A warning means forecast flow at or above 90% of a gauge\'s own 95th-percentile flow, set low on purpose to catch more floods. It is not an official danger level. Forecasts on this site are the model\'s saved replays using recorded rain, so live skill will be lower. Earth imagery: NASA.', 'शोध प्रोटोटाइप, चेतावनी सेवा नहीं। चेतावनी का अर्थ है पूर्वानुमानित प्रवाह गेज के अपने 95वें प्रतिशतक के 90% या उससे ऊपर है, जो अधिक बाढ़ पकड़ने के लिए जानबूझकर कम रखा गया है। यह आधिकारिक खतरे का स्तर नहीं है। इस साइट के पूर्वानुमान दर्ज बारिश के साथ मॉडल के सहेजे गए रीप्ले हैं, इसलिए लाइव प्रदर्शन कम होगा। पृथ्वी की छवि: NASA।')}
      </p>
      <TechDocsModal isOpen={docsOpen} onClose={() => setDocsOpen(false)} />
    </main>
  );
};

export default ModelInfoPage;
