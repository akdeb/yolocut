import { StudioClient } from "./studio-client";

type StudioPageProps = {
  params: Promise<{ queryId: string }>;
};

const StudioPage = async ({ params }: StudioPageProps) => {
  const { queryId } = await params;

  return <StudioClient queryId={queryId} />;
};

export default StudioPage;
