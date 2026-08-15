-- Replace the original short production credit with the first public PPP project description.
-- The compare-and-set conditions preserve any newer admin-authored copy.
update public.music_releases
set summary = 'Jinbo의 비트와 2명의 래퍼와 같이 제작한 음원으로 10월 오피셜 발매 예정인 음원입니다. 아트워크와 앨범 소개글 참여를 원한다면 함께해요.'
where project_slug = 'vintagechord-post-production'
  and release_number = 4
  and title = '미정 프로젝트'
  and summary = 'Prod.Jinbo';
