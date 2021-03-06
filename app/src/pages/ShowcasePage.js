import React from 'react'
import { observer, inject } from 'mobx-react'

import Header from '../components/Header'
import Footer from '../components/Footer'
import Subtitle from '../components/Subtitle'
import CraftableTokenFeed from '../components/CraftableTokenFeed'
import SectionHeader from '../components/SectionHeader'
import WithWeb3Context from '../components/WithWeb3Context'
import EmptyState from '../components/EmptyState'

@inject('store')
@observer
class ShowcasePage extends React.Component {
  render () {
    const { match, store } = this.props
    const { domain } = store
    return (
      <div>
        <Header>Wallet</Header>
        <Subtitle>
          Here you can find all the Craftable Tokens you own and Recipes you created
        </Subtitle>
        <SectionHeader>
          My Crafted Tokens
        </SectionHeader>
        <WithWeb3Context read render={() => (
          <CraftableTokenFeed
            emptyChildren={() => <EmptyState />}
            tokens={domain.myCraftedTokens.current()}
            isLoading={domain.myCraftedTokens.busy()}
            withBalanceOfAddress={match.params.address}
          />
        )} />

        <SectionHeader>
          My Recipes
        </SectionHeader>

        <WithWeb3Context read render={() => (
          <CraftableTokenFeed
            emptyChildren={() => <EmptyState />}
            tokens={domain.myRecipes.current()}
            isLoading={domain.myRecipes.busy()}
          />
        )} />

        <Footer />
      </div>
    )
  }
}

export default ShowcasePage
