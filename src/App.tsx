import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout/Layout';
import { LibraryPage } from './pages/Library/LibraryPage';
import { EditorPage } from './pages/Editor/EditorPage';
import { ViewPage } from './pages/View/ViewPage';
import { FlowchartsPage } from './pages/Flowcharts/FlowchartsPage';
import { PdfViewerPage } from './pages/PdfViewer/PdfViewerPage';
import './global.css';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/flowcharts" element={<FlowchartsPage />} />
          <Route path="/pdf/:attachmentId" element={<PdfViewerPage />} />
          <Route path="/note/new" element={<EditorPage />} />
          <Route path="/note/:id/edit" element={<EditorPage />} />
          <Route path="/note/:id" element={<ViewPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
